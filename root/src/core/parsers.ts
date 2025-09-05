import { z } from 'zod';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Initialize wink-nlp once
const nlp = winkNLP(model);

// Universal parser interface
export interface ParseRequest {
  text: string;
  type: 'date' | 'city' | 'intent' | 'slots';
  context?: Record<string, any>;
  language?: 'en' | 'ru' | 'auto';
}

export interface ParseResponse<T = any> {
  success: boolean;
  data: T | null;
  confidence: number;
  normalized?: string;
}

// City parser schema
const CityParseResult = z.object({
  city: z.string().min(1),
  country: z.string().optional(),
  normalized: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

// Date parser schema
const DateParseResult = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  month: z.string().optional(),
  dates: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

// Intent parser schema
const IntentParseResult = z.object({
  intent: z.enum(['weather', 'destinations', 'packing', 'attractions', 'unknown']),
  confidence: z.number().min(0).max(1),
  slots: z.record(z.string()),
});

// Origin/destination parser schema
const OriginDestinationParseResult = z.object({
  originCity: z.string().optional(),
  destinationCity: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

/**
 * LLM-first city parser with wink-nlp NER fallback
 */
export async function parseCity(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof CityParseResult>>> {
  // Quick rejection for obvious non-cities
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i.test(text.trim())) {
    return { success: false, data: null, confidence: 0 };
  }

  // LLM-first approach
  try {
    const promptTemplate = await getPrompt('city_parser');
    const prompt = promptTemplate
      .replace('{text}', text)
      .replace('{context}', context ? JSON.stringify(context) : '{}');

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = CityParseResult.parse(json);
    
    return {
      success: true,
      data: result,
      confidence: result.confidence,
      normalized: result.normalized,
    };
  } catch (error) {
    // Fallback to wink-nlp NER
    return parseCityWithNLP(text);
  }
}

/**
 * Wink-NLP based city extraction fallback
 */
function parseCityWithNLP(text: string): ParseResponse<z.infer<typeof CityParseResult>> {
  try {
    const doc = nlp.readDoc(text);
    
    // Extract proper nouns that could be cities
    const entities = doc.entities();
    if (entities.length() > 0) {
      const entityItems = entities.itemAt(0);
      if (entityItems) {
        const city = entityItems.out();
        return {
          success: true,
          data: { city, normalized: city, confidence: 0.7 },
          confidence: 0.7,
          normalized: city,
        };
      }
    }
    
    // Fallback to capitalized words after prepositions
    const tokens = doc.tokens();
    const tokenArray = tokens.out();
    
    for (let i = 0; i < tokenArray.length - 1; i++) {
      const token = tokenArray[i];
      const nextToken = tokenArray[i + 1];
      
      if (token && nextToken && 
          /^(from|to|in|at|for|out|leaving|ex)$/i.test(token) && 
          /^[A-Z][a-z]+/.test(nextToken)) {
        // Look ahead for multi-word city names
        let city = nextToken;
        for (let j = i + 2; j < Math.min(i + 4, tokenArray.length); j++) {
          const laterToken = tokenArray[j];
          if (laterToken && /^[A-Z][a-z]+/.test(laterToken)) {
            city += ' ' + laterToken;
          } else {
            break;
          }
        }
        
        return {
          success: true,
          data: { city, normalized: city, confidence: 0.6 },
          confidence: 0.6,
          normalized: city,
        };
      }
    }
    
    return { success: false, data: null, confidence: 0 };
  } catch (error) {
    return { success: false, data: null, confidence: 0 };
  }
}

/**
 * LLM-first date parser with wink-nlp temporal extraction fallback
 */
export async function parseDate(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof DateParseResult>>> {
  // Handle immediate time references
  const nowWords = ['now', 'today', 'currently', 'right now', 'at the moment'];
  if (nowWords.some(word => text.toLowerCase().includes(word))) {
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    return {
      success: true,
      data: { dates: currentMonth, month: currentMonth, confidence: 1.0 },
      confidence: 1.0,
      normalized: currentMonth,
    };
  }

  // LLM-first approach
  try {
    const promptTemplate = await getPrompt('date_parser');
    const prompt = promptTemplate
      .replace('{text}', text)
      .replace('{context}', context ? JSON.stringify(context) : '{}');

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = DateParseResult.parse(json);
    
    // Filter out placeholder responses
    if (result.confidence < 0.5 || 
        !result.dates || 
        /placeholder|unknown|normalized_date_string|month_name/i.test(result.dates)) {
      throw new Error('Low confidence or placeholder result');
    }
    
    return {
      success: true,
      data: result,
      confidence: result.confidence,
      normalized: result.dates,
    };
  } catch (error) {
    // Fallback to wink-nlp temporal extraction
    return parseDateWithNLP(text);
  }
}

/**
 * Wink-NLP based date extraction fallback
 */
function parseDateWithNLP(text: string): ParseResponse<z.infer<typeof DateParseResult>> {
  try {
    const doc = nlp.readDoc(text);
    
    // Extract temporal entities
    const entities = doc.entities();
    if (entities.length() > 0) {
      const entityItems = entities.itemAt(0);
      if (entityItems) {
        const dateStr = entityItems.out();
        return {
          success: true,
          data: { dates: dateStr, month: dateStr, confidence: 0.7 },
          confidence: 0.7,
          normalized: dateStr,
        };
      }
    }
    
    // Fallback to month name extraction
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December', 'Jan', 'Feb',
      'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    
    const tokens = doc.tokens();
    const tokenArray = tokens.out();
    
    for (const token of tokenArray) {
      if (token && monthNames.some(month => month.toLowerCase() === token.toLowerCase())) {
        return {
          success: true,
          data: { dates: token, month: token, confidence: 0.6 },
          confidence: 0.6,
          normalized: token,
        };
      }
    }
    
    return { success: false, data: null, confidence: 0 };
  } catch (error) {
    return { success: false, data: null, confidence: 0 };
  }
}

/**
 * LLM-first origin/destination parser
 */
export async function parseOriginDestination(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof OriginDestinationParseResult>>> {
  // LLM-first approach
  try {
    const prompt = `Extract origin and destination cities from this text. Return JSON with originCity and destinationCity fields (null if not found) and confidence (0-1).

Text: "${text}"
Context: ${context ? JSON.stringify(context) : '{}'}

Look for patterns like:
- "from X" or "leaving X" = origin
- "to Y" or "in Y" = destination

Return only valid JSON.`;

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = OriginDestinationParseResult.parse(json);
    
    if (result.confidence > 0.5) {
      return {
        success: true,
        data: result,
        confidence: result.confidence,
      };
    }
    throw new Error('Low confidence result');
  } catch (error) {
    // Fallback to NLP-enhanced pattern matching
    return parseOriginDestinationWithNLP(text);
  }
}

/**
 * NLP-enhanced origin/destination parsing fallback
 */
function parseOriginDestinationWithNLP(text: string): ParseResponse<z.infer<typeof OriginDestinationParseResult>> {
  try {
    const doc = nlp.readDoc(text);
    const tokens = doc.tokens();
    const tokenArray = tokens.out();
    
    // Temporal words to exclude from city names
    const temporalWords = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 
                          'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 
                          'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
                          'today', 'tomorrow', 'yesterday', 'now', 'next', 'last', 'this',
                          'week', 'month', 'year', 'morning', 'afternoon', 'evening', 'night'];
    
    let originCity: string | undefined;
    let destinationCity: string | undefined;
    
    // Look for origin patterns
    for (let i = 0; i < tokenArray.length - 1; i++) {
      const token = tokenArray[i];
      if (token && ['from', 'leaving', 'out'].includes(token.toLowerCase())) {
        // Extract city name after preposition
        let city = '';
        for (let j = i + 1; j < Math.min(i + 4, tokenArray.length); j++) {
          const nextToken = tokenArray[j];
          if (nextToken && /^[A-Z][a-z]+/.test(nextToken) && 
              !temporalWords.includes(nextToken.toLowerCase())) {
            city += (city ? ' ' : '') + nextToken;
          } else if (nextToken && ['of', 'the'].includes(nextToken.toLowerCase())) {
            continue; // Skip articles
          } else {
            break;
          }
        }
        if (city) {
          originCity = city;
          break;
        }
      }
    }
    
    // Look for destination patterns (but avoid temporal words)
    for (let i = 0; i < tokenArray.length - 1; i++) {
      const token = tokenArray[i];
      if (token && ['to', 'at'].includes(token.toLowerCase())) { // Removed 'in' to avoid "in August"
        let city = '';
        for (let j = i + 1; j < Math.min(i + 4, tokenArray.length); j++) {
          const nextToken = tokenArray[j];
          if (nextToken && /^[A-Z][a-z]+/.test(nextToken) && 
              !temporalWords.includes(nextToken.toLowerCase())) {
            city += (city ? ' ' : '') + nextToken;
          } else if (nextToken && ['the'].includes(nextToken.toLowerCase())) {
            continue;
          } else {
            break;
          }
        }
        if (city && city !== originCity) {
          destinationCity = city;
          break;
        }
      }
    }
    
    if (originCity || destinationCity) {
      return {
        success: true,
        data: { originCity, destinationCity, confidence: 0.7 },
        confidence: 0.7,
      };
    }
    
    return { success: false, data: null, confidence: 0 };
  } catch (error) {
    return { success: false, data: null, confidence: 0 };
  }
}

/**
 * LLM-first intent parser
 */
export async function parseIntent(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof IntentParseResult>>> {
  const contextInfo = context && Object.keys(context).length > 0 
    ? `Previous context: ${JSON.stringify(context)}. Use this context to fill missing slots.`
    : '';
    
  try {
    const promptTemplate = await getPrompt('intent_parser');
    const prompt = promptTemplate
      .replace('{text}', text)
      .replace('{contextInfo}', contextInfo);

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = IntentParseResult.parse(json);
    
    // Merge context slots with extracted slots
    const mergedSlots = { ...context, ...result.slots };
    
    return {
      success: true,
      data: { ...result, slots: mergedSlots },
      confidence: result.confidence,
    };
  } catch (error) {
    // Fallback to simple pattern matching
    return parseIntentWithPatterns(text, context);
  }
}

/**
 * Pattern-based intent parsing fallback
 */
function parseIntentWithPatterns(text: string, context?: Record<string, any>): ParseResponse<z.infer<typeof IntentParseResult>> {
  const lower = text.toLowerCase();
  
  if (/weather|temperature|forecast|climate/.test(lower)) {
    return {
      success: true,
      data: { intent: 'weather', confidence: 0.8, slots: context || {} },
      confidence: 0.8,
    };
  }
  
  if (/pack|bring|wear|clothes|luggage/.test(lower)) {
    return {
      success: true,
      data: { intent: 'packing', confidence: 0.8, slots: context || {} },
      confidence: 0.8,
    };
  }
  
  if (/attraction|museum|do in|activities|visit/.test(lower)) {
    return {
      success: true,
      data: { intent: 'attractions', confidence: 0.8, slots: context || {} },
      confidence: 0.8,
    };
  }
  
  if (/where to go|destination|recommend|suggest/.test(lower)) {
    return {
      success: true,
      data: { intent: 'destinations', confidence: 0.8, slots: context || {} },
      confidence: 0.8,
    };
  }
  
  return {
    success: true,
    data: { intent: 'unknown', confidence: 0.3, slots: context || {} },
    confidence: 0.3,
  };
}

/**
 * Enhanced slot extraction using LLM-first approach with NLP fallbacks
 */
export async function extractSlots(text: string, context?: Record<string, any>, logger?: any): Promise<Record<string, string>> {
  const slots: Record<string, string> = {};
  
  // Parse origin/destination cities first (most specific)
  const originDestResult = await parseOriginDestination(text, context, logger);
  if (originDestResult.success && originDestResult.data) {
    if (originDestResult.data.originCity) {
      slots.originCity = originDestResult.data.originCity;
      slots.city = originDestResult.data.originCity; // Backward compatibility
    }
    if (originDestResult.data.destinationCity) {
      slots.city = originDestResult.data.destinationCity;
    }
  } else {
    // Fallback to regular city parsing
    const cityResult = await parseCity(text, context, logger);
    if (cityResult.success && cityResult.data?.normalized && cityResult.confidence > 0.5) {
      slots.city = cityResult.data.normalized;
    }
  }
  
  // Parse dates with high confidence threshold
  const dateResult = await parseDate(text, context, logger);
  if (dateResult.success && dateResult.data?.dates && dateResult.confidence >= 0.5) {
    slots.dates = dateResult.data.dates;
    if (dateResult.data.month) {
      slots.month = dateResult.data.month;
    }
  }
  
  return slots;
}
