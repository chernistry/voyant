import { z } from 'zod';
import { callLLM } from './llm.js';

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

// Intent parser schema (updated to include 'weather')
const IntentParseResult = z.object({
  intent: z.enum(['weather', 'destinations', 'packing', 'attractions', 'unknown']),
  confidence: z.number().min(0).max(1),
  slots: z.record(z.string()),
});

export async function parseCity(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof CityParseResult>>> {
  // Check if text is just a month name
  const monthNames = /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i;
  if (monthNames.test(text.trim())) {
    return {
      success: false,
      data: null,
      confidence: 0,
    };
  }

  // First check if there's any city-like word in the text
  const hasLocationWords = /\b(?:in|to|for|from|at|visit|go|travel|weather|city|place|destination)\b/i.test(text);
  const hasCityPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/.test(text);
  
  // If no location context and no city patterns, return low confidence
  if (!hasLocationWords && !hasCityPattern && text.length < 20) {
    return {
      success: false,
      data: null,
      confidence: 0,
    };
  }

  const prompt = `Task: Extract and normalize city name from text.

Rules:
- Extract city from phrases: "Weather in Moscow", "Погода в Москве", "Things to do in Paris"
- Handle prepositions: "in", "в", "to", "для", "from", "из"
- Handle pronouns with context: "there"→use context city, "here"→use context city
- Normalize common abbreviations: NYC→New York, SF→San Francisco, LA→Los Angeles
- Handle multilingual: Москва→Moscow, Питер→Saint Petersburg
- Return confidence 0.9+ for clear cities, 0.5-0.8 for ambiguous, <0.5 for unclear
- If NO city is mentioned in the text, return confidence 0.0

Input: "${text}"
Context: ${context ? JSON.stringify(context) : '{}'}

Output JSON only:
{"city": "clean_city_name", "normalized": "normalized_name", "confidence": 0.0-1.0}`;

  try {
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
    // Fallback to regex extraction
    const cityMatch = text.match(/\b(?:in|to|for|from)\s+([A-Z][A-Za-z\- ]+)/);
    if (cityMatch?.[1]) {
      const city = cityMatch[1].split(/[.,!?]/)[0]?.trim();
      if (city) {
        return {
          success: true,
          data: { city, normalized: city, confidence: 0.6 },
          confidence: 0.6,
          normalized: city,
        };
      }
    }
    
    return {
      success: false,
      data: null,
      confidence: 0,
    };
  }
}

export async function parseDate(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof DateParseResult>>> {
  // Handle immediate time references
  const nowWords = ['now', 'today', 'currently', 'right now', 'at the moment', 'сегодня', 'сейчас'];
  if (nowWords.some(word => text.toLowerCase().includes(word))) {
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    return {
      success: true,
      data: { dates: currentMonth, month: currentMonth, confidence: 1.0 },
      confidence: 1.0,
      normalized: currentMonth,
    };
  }

  const prompt = `Task: Extract and normalize date/time information from text.

Rules:
- Support formats: "June 2024", "June 24-28", "next week", "15-20 июня", "March", "March."
- Handle typos: "Jnne" → June, "Mrch" → March, "Jly" → July
- Single month names are valid (e.g., "March" → March, "June." → June)
- Normalize to consistent format
- Extract month names in any language
- Return confidence based on specificity
- If NO dates/months mentioned, return confidence 0.0
- Do NOT fabricate dates that aren't in the text

Input: "${text}"
Context: ${context ? JSON.stringify(context) : '{}'}

Output JSON only:
{"dates": "normalized_date_string", "month": "month_name", "confidence": 0.0-1.0}`;

  try {
    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = DateParseResult.parse(json);
    
    // Filter out placeholder text and low confidence results
    if (result.confidence < 0.5 || 
        !result.dates || 
        result.dates.includes('normalized_date_string') ||
        result.dates.includes('month_name') ||
        result.dates.toLowerCase().includes('placeholder') ||
        result.dates.toLowerCase().includes('unknown')) {
      return {
        success: false,
        data: null,
        confidence: 0,
      };
    }
    
    return {
      success: true,
      data: result,
      confidence: result.confidence,
      normalized: result.dates,
    };
  } catch (error) {
    // Fallback to regex
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December', 'Jan', 'Feb',
      'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const months = new RegExp(`\\b(${monthNames.join('|')})\\w*\\b`, 'i');
    const monthMatch = text.match(months);
    
    if (monthMatch?.[1]) {
      return {
        success: true,
        data: { dates: monthMatch[1], month: monthMatch[1], confidence: 0.7 },
        confidence: 0.7,
        normalized: monthMatch[1],
      };
    }
    
    return {
      success: false,
      data: null,
      confidence: 0,
    };
  }
}

export async function parseIntent(text: string, context?: Record<string, any>, logger?: any): Promise<ParseResponse<z.infer<typeof IntentParseResult>>> {
  const contextInfo = context && Object.keys(context).length > 0 
    ? `Previous context: ${JSON.stringify(context)}. Use this context to fill missing slots.`
    : '';
    
  const prompt = `Task: Classify intent and extract all slots from user message.

Intents:
- "weather": temperature, climate, forecast (e.g., "What's the weather in Paris?", "Tokyo in March weather")
- "destinations": where to go, travel options/recommendations
- "packing": what to pack/bring/wear
- "attractions": what to do/see/visit
- "unknown": unclear or unrelated to travel

Rules:
- Extract clean slot values (city names without surrounding text)
- Handle multilingual queries
- Use previous context to fill missing information
- Return high confidence for clear intents
${contextInfo}

Input: "${text}"

Output JSON only:
{"intent": "weather|destinations|packing|attractions|unknown", "confidence": 0.0-1.0, "slots": {"city": "clean_name", "month": "month", "dates": "dates"}}`;

  try {
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
    return {
      success: false,
      data: null,
      confidence: 0,
    };
  }
}

// Enhanced slot extraction using individual parsers
export async function extractSlots(text: string, context?: Record<string, any>, logger?: any): Promise<Record<string, string>> {
  const slots: Record<string, string> = {};
  
  // Parse city
  const cityResult = await parseCity(text, context, logger);
  if (cityResult.success && cityResult.data?.normalized && cityResult.confidence > 0.5) {
    slots.city = cityResult.data.normalized;
  }
  
  // Parse dates - only if confidence is high enough
  const dateResult = await parseDate(text, context, logger);
  if (dateResult.success && dateResult.data?.dates && dateResult.confidence >= 0.5) {
    slots.dates = dateResult.data.dates;
    if (dateResult.data.month) {
      slots.month = dateResult.data.month;
    }
  }
  
  return slots;
}
