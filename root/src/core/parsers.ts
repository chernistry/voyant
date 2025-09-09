import { z } from 'zod';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import { extractEntities } from './ner.js';
import type pino from 'pino';

// Confidence thresholds (tunable)
const CITY_NLP_MIN = 0.65;
const OD_NLP_MIN = 0.6;
const DATE_NLP_MIN = 0.6;

// Common temporal words/months guardrails
export const MONTH_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
const TEMPORAL_WORDS = [
  ...MONTH_WORDS,
  'today', 'tomorrow', 'yesterday', 'now', 'next', 'last', 'this',
  'week', 'month', 'year', 'morning', 'afternoon', 'evening', 'night'
];

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
 * Transformers-first city parser (NER), then LLM, then heuristics.
 */
export async function parseCity(
  text: string,
  context?: Record<string, any>,
  logger?: any,
): Promise<ParseResponse<z.infer<typeof CityParseResult>>> {
  // Guard: if the whole token is a month-like string, do not treat as city
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i.test(text.trim())) {
    return { success: false, data: null, confidence: 0 };
  }

  // Transformers.js NER - get candidate entities
  let locs: any[] = [];
  try {
    const { extractEntities } = await import('./ner.js');
    const spans = await extractEntities(text, logger as pino.Logger);
    // Prefer LOC spans; simple filters to avoid months and placeholders
    locs = (spans || []).filter(s => /LOC|MISC/i.test(s.entity_group || ''));
  } catch (error) {
    if (logger?.debug) logger.debug({ error: String(error) }, 'city_ner_failed');
  }
  
  // AI-first approach: Use LLM to determine the best city name from candidates
  try {
    // Extract potential city name candidates from text
    const words = text.split(/\s+/);
    const potentialCities = [];
    
    // Generate multi-word candidates
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word || !/^[A-Z]/.test(word) || /^(from|in|on|at|to|for|with|by|of|the|a|an)$/i.test(word)) {
        continue;
      }
      
      // Try 1-3 word combinations
      for (let j = 0; j < 3 && i + j < words.length; j++) {
        const candidate = words.slice(i, i + j + 1).join(' ').replace(/[.,!?]+$/, '');
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(candidate) && candidate.length > 1) {
          potentialCities.push(candidate);
        }
      }
    }
    
    // Deduplicate and filter candidates
    const uniqueCities = [...new Set(potentialCities)];
    
    if (uniqueCities.length > 0) {
      const prompt = `Extract the most likely city name from this text. Return JSON with city and confidence (0-1).

Text: "${text}"
Context: ${context ? JSON.stringify(context) : '{}'}

Potential city candidates: ${JSON.stringify(uniqueCities)}

Return only valid JSON with "city" and "confidence" fields.`;

      const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
      const json = JSON.parse(raw);
      const result = CityParseResult.parse(json);
      
      // Validate that the LLM result is reasonable
      const normalizedLower = (result.normalized || '').trim().toLowerCase();
      const isPlaceholder = !result.normalized ||
        result.confidence < 0.5 ||
        ['unknown', 'clean_city_name', 'there', 'normalized_name'].includes(normalizedLower) ||
        MONTH_WORDS.includes(normalizedLower);
        
      if (!isPlaceholder) {
        if (logger?.debug) logger.debug({ 
          llmResult: result,
          potentialCities: uniqueCities
        }, 'city_llm_success');
        return {
          success: true,
          data: result,
          confidence: result.confidence,
          normalized: result.normalized,
        };
      }
    }
  } catch (error) {
    if (logger?.debug) logger.debug({ error: String(error) }, 'city_llm_failed');
  }

  // Fallback to NER-based approach if LLM fails
  try {
    const stop = new Set(['today','tomorrow','now','month','week']);
    
    // AI-first approach: Look for consecutive location entities that form a complete city name
    // This handles cases like "Tel Aviv" being split into "Tel" and "Aviv"
    let bestCandidate = null;
    let bestConfidence = 0;
    
    // First, try to find multi-word entities by looking at consecutive locations
    for (let i = 0; i < locs.length; i++) {
      const current = locs[i];
      if (!current) continue;
      
      const currentText = (current.text || '').trim();
      
      if (!currentText) continue;
      
      const looksProper = /^[A-Z][A-Za-z\- ]+$/.test(currentText);
      const isTemporal = MONTH_WORDS.includes(currentText.toLowerCase());
      
      if (!looksProper || isTemporal || stop.has(currentText.toLowerCase())) continue;
      
      // Check if this is part of a larger entity by looking at text positions
      let combinedText = currentText;
      let combinedScore = current.score || 0;
      let j = i + 1;
      
      // Look for consecutive location entities that might form a single city name
      while (j < locs.length) {
        const next = locs[j];
        if (!next) {
          j++;
          continue;
        }
        
        const nextText = (next.text || '').trim();
        
        // Check if the next entity is close to the current one in the text
        const currentIndex = text.indexOf(currentText);
        const nextIndex = text.indexOf(nextText);
        
        if (currentIndex !== -1 && nextIndex !== -1 && 
            nextIndex > currentIndex && 
            nextIndex - currentIndex <= currentText.length + 3) { // Allow for space and maybe a word
          combinedText += ' ' + nextText;
          combinedScore = Math.min(combinedScore, next.score || 0);
          j++;
        } else {
          break;
        }
      }
      
      // Use the combined entity if it's better than what we have
      if (combinedScore > bestConfidence) {
        bestCandidate = combinedText;
        bestConfidence = combinedScore;
      }
    }
    
    // If we didn't find a good multi-word entity, fall back to single entities
    if (!bestCandidate && locs.length > 0) {
      const cand = locs.find(s => {
        if (!s) return false;
        const t = (s.text || '').trim();
        if (!t) return false;
        const looksProper = /^[A-Z][A-Za-z\- ]+$/.test(t);
        const isTemporal = MONTH_WORDS.includes(t.toLowerCase());
        return looksProper && !isTemporal && !stop.has(t.toLowerCase());
      });
      
      if (cand && typeof cand.text === 'string' && cand.text.length > 0) {
        bestCandidate = cand.text.trim();
        bestConfidence = cand.score || 0;
      }
    }
    
    if (bestCandidate) {
      const parts = String(bestCandidate || '').split(/[.,!?]/);
      const firstPart = (parts.shift() ?? '');
      const normalized = firstPart.trim();
      if (normalized) {
        const confidence = Math.min(0.72, Math.max(0.5, bestConfidence));
        if (logger?.debug) logger.debug({ 
          ner: locs, 
          bestCandidate, 
          confidence 
        }, 'city_transformers_accepted');
        return {
          success: true,
          data: { city: normalized, normalized, confidence },
          confidence,
          normalized,
        };
      }
    }
  } catch (error) {
    if (logger?.debug) logger.debug({ error: String(error) }, 'city_transformers_failed');
  }

  // LLM fallback
  try {
    const promptTemplate = await getPrompt('city_parser');
    const prompt = promptTemplate
      .replace('{text}', text)
      .replace('{context}', context ? JSON.stringify(context) : '{}');

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = CityParseResult.parse(json);
    // Filter out placeholder/low-signal responses
    const normalizedLower = (result.normalized || '').trim().toLowerCase();
    const isPlaceholder = !result.normalized ||
      result.confidence < 0.5 ||
      ['unknown', 'clean_city_name', 'there', 'normalized_name'].includes(normalizedLower) ||
      MONTH_WORDS.includes(normalizedLower);
    if (isPlaceholder) {
      throw new Error('Low confidence or placeholder city');
    }
    return {
      success: true,
      data: result,
      confidence: result.confidence,
      normalized: result.normalized,
    };
  } catch (error) {
    // Heuristics last-resort: only after NER and LLM failed
    const heuristicPatterns: Array<RegExp> = [
      /\b(?:let'?s\s+say|lets\s+say|say|how\s+about|maybe|consider)\s+([A-Z][A-Za-z\- ]+)/i,
      /\b([A-Z][A-Za-z\- ]+)\s+with\s+(?:a|the)\s+kid/i,
      /\b(?:in|to)\s+([A-Z][A-Za-z\- ]+)/,
    ];
    for (const rx of heuristicPatterns) {
      const m = text.match(rx);
      const cand = m?.[1]?.trim();
      if (typeof cand === 'string' && cand.length > 0 && !TEMPORAL_WORDS.includes(cand.toLowerCase())) {
        const c = cand!;
        const firstPart = c.split(/[.,!?]/)[0] || '';
        const normalized = firstPart.trim();
        const stoplist = new Set(['hey','hi','hello','thanks','thank you','ok','okay','what','where','when','why','how','which','who']);
        if (!/^[A-Z][A-Za-z\- ]+$/.test(normalized) || stoplist.has(normalized.toLowerCase())) continue;
        if (logger?.debug) logger.debug({ cand: normalized }, 'city_heuristic_last_resort');
        return {
          success: true,
          data: { city: normalized, normalized, confidence: 0.6 },
          confidence: 0.6,
          normalized,
        };
      }
    }
    return { success: false, data: null, confidence: 0 };
  }
}

// wink-based city fallback removed

/**
 * Date parser without wink/compromise: immediate terms → regex months → LLM.
 */
export async function parseDate(
  text: string,
  context?: Record<string, any>,
  logger?: any,
): Promise<ParseResponse<z.infer<typeof DateParseResult>>> {
  // Handle immediate time references
  const nowWords = ['now', 'today', 'currently', 'right now', 'at the moment'];
  if (nowWords.some((word) => text.toLowerCase().includes(word))) {
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    return {
      success: true,
      data: { dates: currentMonth, month: currentMonth, confidence: 1.0 },
      confidence: 1.0,
      normalized: currentMonth,
    };
  }

  // Transformers.js NER for DATE/TIME entities (preferred)
  try {
    const { extractEntities } = await import('./ner.js');
    const spans: Array<{ entity_group: string; text: string }> = await extractEntities(text, logger);
    const dateLike = (spans || []).filter(s => /DATE|TIME/i.test(String(s.entity_group || '')));
    const picked = dateLike[0];
    if (picked && typeof picked.text === 'string' && picked.text.trim().length > 0) {
      // Normalize via LLM date parser to keep logic consistent
      const snippet = picked.text.trim();
      const promptTemplate = await getPrompt('date_parser');
      const prompt = promptTemplate
        .replace('{text}', snippet)
        .replace('{context}', context ? JSON.stringify(context) : '{}');

      const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
      const json = JSON.parse(raw);
      const result = DateParseResult.parse(json);
      if (result.confidence >= 0.5 && result.dates) {
        return {
          success: true,
          data: result,
          confidence: result.confidence,
          normalized: result.dates,
        };
      }
    }
  } catch {
    // ignore and continue to LLM fallback
  }

  // LLM fallback
  try {
    const promptTemplate = await getPrompt('date_parser');
    const prompt = promptTemplate
      .replace('{text}', text)
      .replace('{context}', context ? JSON.stringify(context) : '{}');

    const raw = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const json = JSON.parse(raw);
    const result = DateParseResult.parse(json);

    // Filter out placeholder responses
    if (
      result.confidence < 0.5 ||
      !result.dates ||
      /placeholder|unknown|normalized_date_string|month_name/i.test(result.dates)
    ) {
      throw new Error('Low confidence or placeholder result');
    }
    return {
      success: true,
      data: result,
      confidence: result.confidence,
      normalized: result.dates,
    };
  } catch (error) {
    // Rules-last deterministic month extraction
    const monthRegex = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
    const m = text.match(monthRegex);
    if (m) {
      const month = m[0];
      return {
        success: true,
        data: { dates: month, month, confidence: 0.9 },
        confidence: 0.9,
        normalized: month,
      };
    }
    return { success: false, data: null, confidence: 0 };
  }
}

// wink-based date fallback removed

/**
 * Transformers-first origin/destination parser (NER + heuristics), then LLM fallback
 */
export async function parseOriginDestination(
  text: string,
  context?: Record<string, any>,
  logger?: any,
): Promise<ParseResponse<z.infer<typeof OriginDestinationParseResult>>> {
  // Transformers.js NER first
  try {
    const { extractEntities } = await import('./ner.js');
    const spans = await extractEntities(text, logger as pino.Logger);
    
    // Extract LOC/GPE entities in order of appearance
    const locations = (spans || [])
      .filter(s => /LOC|GPE|MISC/i.test(s.entity_group || ''))
      .filter(s => {
        const t = (s.text || '').trim();
        const looksProper = /^[A-Z][A-Za-z\- ]+$/.test(t);
        const isTemporal = MONTH_WORDS.includes(t.toLowerCase());
        return looksProper && !isTemporal && t.length > 1;
      })
      .map(s => ({ text: s.text?.trim(), index: text.indexOf(s.text || '') }));

    if (locations.length > 0) {
      let originCity: string | undefined;
      let destinationCity: string | undefined;
      
      // AI-first approach: Use contextual analysis to determine origin/destination
      // Look for prepositions and match with nearby entities
      const words = text.split(/\s+/);
      const fromIndex = words.findIndex(word => word.toLowerCase() === 'from');
      const toIndex = words.findIndex(word => word.toLowerCase() === 'to');
      const inIndex = words.findIndex(word => word.toLowerCase() === 'in');
      
      // Find the entity that comes after "from"
      if (fromIndex !== -1 && fromIndex < words.length - 1) {
        // Look for the next 1-3 words to form a potential city name
        for (let i = 1; i <= 3; i++) {
          if (fromIndex + i < words.length) {
            const candidate = words.slice(fromIndex + 1, fromIndex + 1 + i).join(' ');
            const matchingLoc = locations.find(loc => 
              loc.text && candidate.toLowerCase() === loc.text.toLowerCase()
            );
            if (matchingLoc?.text) {
              originCity = matchingLoc.text;
              break;
            }
          }
        }
      }
      
      // Find the entity that comes after "to"
      if (toIndex !== -1 && toIndex < words.length - 1) {
        // Look for the next 1-3 words to form a potential city name
        for (let i = 1; i <= 3; i++) {
          if (toIndex + i < words.length) {
            const candidate = words.slice(toIndex + 1, toIndex + 1 + i).join(' ');
            const matchingLoc = locations.find(loc => 
              loc.text && candidate.toLowerCase() === loc.text.toLowerCase()
            );
            if (matchingLoc?.text) {
              destinationCity = matchingLoc.text;
              break;
            }
          }
        }
      }
      
      // Find the entity that comes after "in" (only if no destination found yet)
      if (!destinationCity && inIndex !== -1 && inIndex < words.length - 1) {
        // Look for the next 1-3 words to form a potential city name
        for (let i = 1; i <= 3; i++) {
          if (inIndex + i < words.length) {
            const candidate = words.slice(inIndex + 1, inIndex + 1 + i).join(' ');
            const matchingLoc = locations.find(loc => 
              loc.text && candidate.toLowerCase() === loc.text.toLowerCase()
            );
            if (matchingLoc?.text) {
              destinationCity = matchingLoc.text;
              break;
            }
          }
        }
      }
      
      // If we found both or one with good confidence, return
      if (originCity || destinationCity) {
        const confidence = (originCity && destinationCity) ? 0.7 : 0.6;
        if (logger?.debug) {
          logger.debug({ 
            entities: locations.map(l => l.text), 
            originCity, 
            destinationCity, 
            confidence 
          }, 'od_transformers_success');
        }
        return {
          success: true,
          data: { originCity, destinationCity, confidence },
          confidence,
        };
      }
    }
  } catch (error) {
    if (logger?.debug) logger.debug({ error: String(error) }, 'od_transformers_failed');
  }

  // LLM fallback
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
      if (logger?.debug) logger.debug({ result }, 'od_llm_success');
      return {
        success: true,
        data: result,
        confidence: result.confidence,
      };
    }
    throw new Error('Low confidence result');
  } catch (error) {
    if (logger?.debug) logger.debug({ error: String(error) }, 'od_llm_failed');
    
    // Regex as last resort - improved pattern to capture only the city name
    const mFrom = text.match(/\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const mTo = text.match(/\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const mIn = text.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const originCity = mFrom?.[1]?.trim();
    const destinationCity = (mTo?.[1] || mIn?.[1])?.trim();
    
    if (originCity || destinationCity) {
      if (logger?.debug) logger.debug({ originCity, destinationCity }, 'od_regex_fallback');
      return { 
        success: true, 
        data: { 
          originCity: originCity || undefined, 
          destinationCity: destinationCity || undefined, 
          confidence: 0.6 
        }, 
        confidence: 0.6 
      };
    }
    return { success: false, data: null, confidence: 0 };
  }
}

/**
 * NLP-enhanced origin/destination parsing fallback
 */
// wink-based OD fallback removed

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
  
  // Enhanced NER-first location extraction
  try {
    const entities = await extractEntities(text, logger);
    const locationEntities = entities.filter(e => 
      ['LOC', 'LOCATION', 'GPE'].includes(e.entity_group.toUpperCase()) && e.score > 0.5
    );
    
    if (locationEntities.length > 0) {
      // Use highest confidence location as primary city
      const primaryLocation = locationEntities.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      slots.city = primaryLocation.text;
      
      if (logger?.debug) {
        logger.debug({ 
          extractedLocation: primaryLocation.text, 
          confidence: primaryLocation.score,
          allLocations: locationEntities.map(e => e.text)
        }, '📍 Location extracted via NER');
      }
    }
  } catch (error) {
    if (logger?.debug) {
      logger.debug({ error: String(error) }, '❌ NER location extraction failed');
    }
  }
  
  // Fallback: LLM-based city extraction if NER didn't find anything
  if (!slots.city) {
    const cityResult = await parseCity(text, context, logger);
    if (cityResult.success && cityResult.data?.normalized && cityResult.confidence > 0.5) {
      slots.city = cityResult.data.normalized;
    }
  }

  // Parse origin/destination; do not overwrite an already-detected city
  const originDestResult = await parseOriginDestination(text, context, logger);
  if (originDestResult.success && originDestResult.data) {
    if (originDestResult.data.originCity) {
      slots.originCity = originDestResult.data.originCity;
    }
    if (!slots.city && originDestResult.data.destinationCity) {
      slots.city = originDestResult.data.destinationCity;
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
