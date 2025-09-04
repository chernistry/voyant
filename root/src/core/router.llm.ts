import { z } from 'zod';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import { parseIntent, parseCity, parseDate, extractSlots } from './parsers.js';
import type pino from 'pino';

const RouterResponse = z.object({
  intent: z.enum(['weather', 'destinations', 'packing', 'attractions', 'unknown']),
  confidence: z.number().min(0).max(1),
  needExternal: z.boolean().default(false),
  slots: z.object({
    city: z.string().optional(),
    month: z.string().optional(),
    dates: z.string().optional(),
    travelerProfile: z.string().optional(),
  }),
  missingSlots: z.array(z.string()).default([]),
});
export type RouterResponseT = z.infer<typeof RouterResponse>;

export async function routeWithLLM(
  message: string,
  contextSlots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<RouterResponseT> {
  // Use universal parser for intent classification
  const intentResult = await parseIntent(message, contextSlots);
  
  if (intentResult.success && intentResult.data) {
    const { intent, confidence, slots: rawSlots } = intentResult.data;
    
    // Clean up slots using individual parsers
    const cleanSlots: Record<string, string> = {};
    
    // Parse city with proper normalization
    if (rawSlots.city) {
      const cityResult = await parseCity(rawSlots.city, contextSlots);
      if (cityResult.success && cityResult.data?.normalized) {
        cleanSlots.city = cityResult.data.normalized;
      }
    }
    
    // Also try to extract city from the full message if not found in slots
    if (!cleanSlots.city) {
      const cityResult = await parseCity(message, contextSlots);
      if (cityResult.success && cityResult.data?.normalized && cityResult.confidence > 0.5) {
        cleanSlots.city = cityResult.data.normalized;
      }
    }
    
    // Parse dates from message and slots
    const dateText = rawSlots.dates || rawSlots.month || message;
    const dateResult = await parseDate(dateText, contextSlots);
    if (dateResult.success && dateResult.data) {
      if (dateResult.data.dates) cleanSlots.dates = dateResult.data.dates;
      if (dateResult.data.month) cleanSlots.month = dateResult.data.month;
    }
    
    // Merge with context slots - prefer more specific values
    const mergedSlots = { ...contextSlots };
    if (cleanSlots.city && cleanSlots.city !== 'unknown' && cleanSlots.city !== 'clean_city_name' && cleanSlots.city !== 'there') {
      mergedSlots.city = cleanSlots.city;
    }
    if (cleanSlots.month && cleanSlots.month !== 'unknown' && cleanSlots.month !== 'Unknown' && cleanSlots.month !== 'month_name') {
      mergedSlots.month = cleanSlots.month;
    }
    if (cleanSlots.dates && cleanSlots.dates !== 'unknown' && cleanSlots.dates !== 'normalized_date_string' && cleanSlots.dates !== 'next week') {
      mergedSlots.dates = cleanSlots.dates;
    }
    
    // Determine missing slots
    const missingSlots: string[] = [];
    if (intent !== 'unknown') {
      if (!mergedSlots.city) missingSlots.push('city');
      if (intent === 'destinations') {
        if (!mergedSlots.dates && !mergedSlots.month) missingSlots.push('dates');
      }
    }
    
    const needExternal = intent !== 'unknown' && missingSlots.length === 0;
    
    if (logger?.log && typeof logger.log.debug === 'function') {
      logger.log.debug({ 
        intent, 
        confidence, 
        rawSlots, 
        cleanSlots, 
        mergedSlots, 
        missingSlots 
      }, 'llm_router_enhanced');
    }
    
    return RouterResponse.parse({
      intent,
      confidence,
      needExternal,
      slots: {
        city: mergedSlots.city || '',
        month: mergedSlots.month || '',
        dates: mergedSlots.dates || '',
        travelerProfile: mergedSlots.travelerProfile || '',
      },
      missingSlots,
    });
  }
  
  // Fallback to original LLM approach with city cleaning
  return routeWithLLMFallback(message, contextSlots, logger);
}

async function routeWithLLMFallback(
  message: string,
  contextSlots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<RouterResponseT> {
  const instructions = await getPrompt('router');
  const ctx = contextSlots && Object.keys(contextSlots).length > 0
    ? `Known slots from context (may be used if user omits them): ${JSON.stringify(contextSlots)}`
    : 'Known slots from context: {}';
  
  const promptTemplate = await getPrompt('router_fallback');
  const prompt = promptTemplate
    .replace('{instructions}', instructions)
    .replace('{context}', ctx)
    .replace('{message}', message);
  
  if (logger?.log && typeof logger.log.debug === 'function') {
    logger.log.debug({ prompt }, 'llm_router_fallback_prompt');
  }
  
  const raw = await callLLM(prompt, { responseFormat: 'json', log: logger?.log });
  
  if (logger?.log && typeof logger.log.debug === 'function') {
    logger.log.debug({ raw }, 'llm_router_fallback_raw');
  }
  
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = tryExtractJson(raw);
  }
  
  const parsed = RouterResponse.parse(json);
  
  if (logger?.log && typeof logger.log.debug === 'function') {
    logger.log.debug({ parsed }, 'llm_router_fallback_parsed');
  }
  
  return parsed;
}

function tryExtractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no_json');
  return JSON.parse(m[0]);
}