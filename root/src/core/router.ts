import { RouterResult, RouterResultT } from '../schemas/router.js';
import { getPrompt } from './prompts.js';
import { z } from 'zod';
import { callLLM } from './llm.js';
import { routeWithLLM } from './router.llm.js';
import { getThreadSlots } from './slot_memory.js';
import { extractSlots } from './parsers.js';
import type pino from 'pino';

export async function routeIntent(input: { message: string; threadId?: string; logger?: { log: pino.Logger } }): Promise<RouterResultT> {
  if (typeof input.logger?.log?.info === 'function') {
    input.logger.log.debug({ message: input.message }, 'router_start');
  }

  // Prefer LLM router first for robust NLU and slot extraction
  const ctxSlots = input.threadId ? getThreadSlots(input.threadId) : {};

  // Pre-check for unrelated content to override LLM results if needed
  const m = input.message.toLowerCase();
  const unrelatedHints = [
    'meaning of life', 'universe', 'god', 'religion', 'politics', 'philosophy',
    'react', 'javascript', 'programming', 'code', 'software', 'algorithm',
    'medicine', 'medical', 'doctor', 'health', 'disease', 'treatment',
    'cook', 'recipe', 'food', 'restaurant', 'eat', 'drink'
  ];
  
  // Check for travel-related keywords to avoid false positives
  const travelHints = [
    'weather', 'pack', 'bring', 'clothes', 'attraction', 'visit', 'go to', 'travel',
    'destination', 'city', 'country', 'temperature', 'forecast', 'museum', 'activities',
    'where should i go', 'what to do', 'luggage', 'suitcase'
  ];
  
  const hasUnrelatedHints = unrelatedHints.some((hint) => m.includes(hint.toLowerCase()));
  const hasTravelHints = travelHints.some((hint) => m.includes(hint.toLowerCase()));
  
  const isUnrelated = hasUnrelatedHints && !hasTravelHints && 
    m.length >= 3 && // Don't block very short messages yet
    !/^[^a-zA-Zа-яА-Я]*$/.test(m); // Don't block non-alphabetic here

  // Extract slots early for LLM override logic
  const extractedSlots = await extractSlots(input.message, {}, input.logger?.log);
  let finalSlots = extractedSlots;

  const viaStrictLLM = await routeWithLLM(input.message, ctxSlots, input.logger).catch(() => undefined);
  if (viaStrictLLM && viaStrictLLM.confidence > 0.5) {
    // Coerce to RouterResultT shape (missingSlots ignored by schema)
    const { intent, needExternal, slots, confidence } = viaStrictLLM;
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ intent, confidence, source: 'strict_llm' }, 'router_strict_llm_result');
    }

    // Override LLM misclassification for obvious weather queries
    const weatherPatterns = [
      /what'?s the weather/i, 
      /weather like/i, 
      /how hot is/i, 
      /how cold is/i, 
      /temperature/i,
      /weather in/i,
      /weather for/i,
      /climate in/i,
      /climate for/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+weather/i,
      /weather\s+in\s+\w+\s+in\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /\bweather.*\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+in\s+\w+/i,
      /\b(spring|summer|autumn|fall|winter)\s+weather/i,
      /weather\s+in\s+(spring|summer|autumn|fall|winter)/i
    ];
    const isObviousWeather = weatherPatterns.some(pattern => pattern.test(input.message));
    
    if (isObviousWeather && intent !== 'weather') {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ originalIntent: intent, correctedIntent: 'weather' }, 'overriding_llm_weather_misclassification');
      }
      return RouterResult.parse({
        intent: 'weather',
        needExternal: true,
        slots: finalSlots,
        confidence: 0.8
      });
    }

    // Only override LLM result if it's NOT a travel intent but we detected unrelated content
    if (isUnrelated && intent === 'unknown') {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ originalIntent: intent, originalConfidence: confidence }, 'overriding_llm_with_unrelated');
      }
      return RouterResult.parse({
        intent: 'unknown',
        needExternal: false,
        slots: finalSlots,
        confidence: 0.3  // Lower confidence to trigger blend.ts special handling
      });
    }

    return RouterResult.parse({ intent, needExternal, slots, confidence });
  }
  
  const viaLLM = await tryRouteViaLLM(input.message, input.logger).catch(() => undefined);
  if (viaLLM && viaLLM.confidence > 0.5) {
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ intent: viaLLM.intent, confidence: viaLLM.confidence, source: 'llm' }, 'router_llm_result');
    }
    // Override LLM result if we detected unrelated content via heuristics
    if (isUnrelated) {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ originalIntent: viaLLM.intent, originalConfidence: viaLLM.confidence }, 'overriding_llm_with_unrelated');
      }
      return RouterResult.parse({
        intent: 'unknown',
        needExternal: false,
        slots: finalSlots,
        confidence: 0.3
      });
    }
    return viaLLM;
  }
  
  // Fall back to heuristics for low confidence or failed LLM routing
  // If we have LLM results with good slots but low confidence, preserve the slots
  if (viaStrictLLM?.slots) {
    finalSlots = { ...extractedSlots, ...viaStrictLLM.slots };
  }

  const base = { needExternal: false, slots: finalSlots, confidence: 0.7 as const };

  if (typeof input.logger?.log?.info === 'function') {
    input.logger.log.debug({ message: m, isUnrelated, unrelatedHints: unrelatedHints.filter(h => m.toLowerCase().includes(h.toLowerCase())) }, 'heuristic_check');
  }

  if (isUnrelated) {
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ message: m }, 'heuristic_intent_unrelated_block_executed');
    }
    return RouterResult.parse({
      intent: 'unknown',
      needExternal: false,
      slots: finalSlots,
      confidence: 0.3
    });
  }

  const packingHints = ['pack', 'bring', 'clothes', 'items', 'luggage', 'suitcase', 'wear', 'what to wear'];
  const familyHints = ['kids', 'children', 'family'];
  if (
    packingHints.some((k) => m.includes(k)) ||
    (m.includes('what about') && familyHints.some((k) => m.includes(k)))
  ) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_packing');
    }
    return RouterResult.parse({ intent: 'packing', ...base });
  }
  const attractionHints = [
    'attraction',
    'do in',
    'what to do',
    'museum',
    'activities',
  ];
  if (attractionHints.some((k) => m.includes(k))) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_attractions');
    }
    return RouterResult.parse({ intent: 'attractions', ...base });
  }
  
  const weatherHints = ['weather', "what's the weather", 'what is the weather', 'temperature', 'forecast'];
  if (weatherHints.some((k) => m.includes(k))) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_weather');
    }
    return RouterResult.parse({ intent: 'weather', ...base });
  }
  
  const destHints = [
    'where should i go',
    'destination',
    'where to go',
    'budget',
    'options',
  ];
  if (destHints.some((k) => m.includes(k))) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_destinations');
    }
    return RouterResult.parse({ intent: 'destinations', ...base });
  }
  
  // If we have a low-confidence LLM result, use it; otherwise unknown
  if (viaStrictLLM) {
    const { intent, needExternal, slots, confidence } = viaStrictLLM;
    // Override LLM result if we detected unrelated content via heuristics
    if (isUnrelated) {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ originalIntent: intent, originalConfidence: confidence }, 'overriding_llm_with_unrelated');
      }
      return RouterResult.parse({
        intent: 'unknown',
        needExternal: false,
        slots: finalSlots,
        confidence: 0.3
      });
    }
    return RouterResult.parse({ intent, needExternal, slots, confidence });
  }
  if (viaLLM) {
    // Override LLM result if we detected unrelated content via heuristics
    if (isUnrelated) {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ originalIntent: viaLLM.intent, originalConfidence: viaLLM.confidence }, 'overriding_llm_with_unrelated');
      }
      return RouterResult.parse({
        intent: 'unknown',
        needExternal: false,
        slots: finalSlots,
        confidence: 0.3
      });
    }
    return viaLLM;
  }

  if (typeof input.logger?.log?.debug === 'function') {
    input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_unknown');
  }
  const result = RouterResult.parse({ intent: 'unknown', ...base, confidence: 0.4 });
  if (typeof input.logger?.log?.info === 'function') {
    input.logger.log.debug({ intent: result.intent, confidence: result.confidence }, 'router_final_result');
  }
  return result;
}

async function tryRouteViaLLM(message: string, logger?: { log: pino.Logger }): Promise<RouterResultT | undefined> {
  const routerMd = await getPrompt('router');
  if (!routerMd.trim()) return undefined;
  const instructions = routerMd
    .split('\n')
    .filter((l) => !l.trim().startsWith('{') && !l.trim().endsWith('}'))
    .join('\n');
  const sys = 'Task: Classify intent and extract slots. Return strict JSON only.';
  const prompt = `${sys}\n\n${instructions}\n\nUser: ${message}`;
  const raw = await callLLM(prompt, { responseFormat: 'json', log: logger?.log });
  const json = extractJsonObject(raw);
  if (!json) return undefined;
  const schema: z.ZodType<RouterResultT> = RouterResult as unknown as z.ZodType<RouterResultT>;
  try {
    return schema.parse(json);
  } catch {
    return undefined;
  }
}

function extractJsonObject(text: string): unknown | undefined {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]);
  } catch {
    return undefined;
  }
}

