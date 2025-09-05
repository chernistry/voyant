import { RouterResult, RouterResultT } from '../schemas/router.js';
import { getPrompt } from './prompts.js';
import { z } from 'zod';
import { callLLM, classifyIntent, classifyContent, optimizeSearchQuery } from './llm.js';
import { routeWithLLM } from './router.llm.js';
import { getThreadSlots, updateThreadSlots } from './slot_memory.js';
import { extractSlots } from './parsers.js';
import type pino from 'pino';

export async function routeIntent(input: { message: string; threadId?: string; logger?: { log: pino.Logger } }): Promise<RouterResultT> {
  if (typeof input.logger?.log?.info === 'function') {
    input.logger.log.debug({ message: input.message }, 'router_start');
  }

  // Handle edge cases before LLM processing
  const trimmedMessage = input.message.trim();
  if (trimmedMessage.length === 0) {
    return RouterResult.parse({
      intent: 'unknown',
      needExternal: false,
      slots: {},
      confidence: 0.1
    });
  }

  // Use LLM for content classification first
  const contentClassification = await classifyContent(input.message, input.logger?.log);
  
  // Detect complex multi-constraint queries and request deep research consent (flagged)
  if (process.env.DEEP_RESEARCH_ENABLED === 'true') {
    const complexity = detectComplexQuery(input.message);
    // Destination discovery with known constraints should prefer catalog, not deep research
    const looksLikeDestinationDiscovery = /\b(where to go|where can i travel|destinations?|go from|travel from|trip|ideas?)\b/i.test(input.message);
    if (!looksLikeDestinationDiscovery && complexity.isComplex && complexity.confidence >= 0.7) {
      if (input.threadId) {
        updateThreadSlots(input.threadId, {
          awaiting_deep_research_consent: 'true',
          pending_deep_research_query: input.message,
          complexity_reasoning: complexity.reasoning,
        }, []);
      }
      return RouterResult.parse({
        intent: 'system',
        needExternal: false,
        slots: {
          deep_research_consent_needed: 'true',
          complexity_score: complexity.confidence.toFixed(2),
        },
        confidence: 0.9,
      });
    }
  }
  
  // Prefer LLM router first for robust NLU and slot extraction
  const ctxSlots = input.threadId ? getThreadSlots(input.threadId) : {};
  
  // Handle system questions about the AI
  if (contentClassification?.content_type === 'system') {
    return RouterResult.parse({
      intent: 'system',
      needExternal: false,
      slots: {},
      confidence: 0.9
    });
  }
  
  // Handle explicit search commands early
  if (contentClassification?.is_explicit_search) {
    // Extract and optimize search query
    let searchQuery = input.message
      .replace(/search\s+(web|online|internet|google)\s+for\s+/i, '')
      .replace(/google\s+/i, '')
      .replace(/find\s+(online|web)\s+/i, '')
      .replace(/search\s+for\s+/i, '')
      .replace(/look\s+up\s+online\s+/i, '')
      .replace(/web\s+search\s+/i, '')
      .replace(/find\s+/i, '')
      .trim();
    
    if (!searchQuery) {
      searchQuery = input.message;
    }
    
    // Optimize the search query
    const optimizedQuery = await optimizeSearchQuery(
      searchQuery, 
      ctxSlots, 
      'web_search', 
      input.logger?.log
    );
    
    return RouterResult.parse({
      intent: 'web_search',
      needExternal: true,
      slots: { search_query: optimizedQuery },
      confidence: 0.9
    });
  }

  // Check for extremely long city names
  if (/\b\w{30,}\b/.test(input.message)) {
    return RouterResult.parse({
      intent: 'unknown',
      needExternal: false,
      slots: {},
      confidence: 0.2
    });
  }

  // Use LLM content classification for unrelated content detection
  const isUnrelated = contentClassification?.content_type === 'unrelated' || 
                     contentClassification?.content_type === 'gibberish';

  // Extract slots early for LLM override logic (use thread context for better parsing)
  const extractedSlots = await extractSlots(input.message, ctxSlots, input.logger?.log);
  let finalSlots = { ...ctxSlots, ...extractedSlots };

  // If we have prior city context and extracted slots don't have city, preserve prior
  if (ctxSlots.city && !extractedSlots.city) {
    finalSlots.city = ctxSlots.city;
  }
  if (ctxSlots.originCity && !extractedSlots.originCity) {
    finalSlots.originCity = ctxSlots.originCity;
  }

  // Try LLM-based intent classification first
  const llmIntentResult = await classifyIntent(input.message, ctxSlots, input.logger?.log);
  if (llmIntentResult && llmIntentResult.confidence > 0.5) {
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ 
        intent: llmIntentResult.intent, 
        confidence: llmIntentResult.confidence, 
        source: 'llm_intent_classification' 
      }, 'router_llm_intent_result');
    }

    // Simple weather override for obvious cases
    const isObviousWeather = /weather|temperature|climate/i.test(input.message);
    
    if (isObviousWeather && llmIntentResult.intent !== 'weather') {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          originalIntent: llmIntentResult.intent, 
          correctedIntent: 'weather' 
        }, 'overriding_llm_weather_misclassification');
      }
      return RouterResult.parse({
        intent: 'weather',
        needExternal: true,
        slots: finalSlots,
        confidence: 0.8
      });
    }

    // Override LLM result if we detected unrelated content
    if (isUnrelated && llmIntentResult.intent === 'unknown') {
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          originalIntent: llmIntentResult.intent, 
          originalConfidence: llmIntentResult.confidence 
        }, 'overriding_llm_with_unrelated');
      }
      return RouterResult.parse({
        intent: 'unknown',
        needExternal: false,
        slots: finalSlots,
        confidence: 0.3
      });
    }

    return RouterResult.parse({ 
      intent: llmIntentResult.intent, 
      needExternal: llmIntentResult.needExternal, 
      slots: finalSlots, 
      confidence: llmIntentResult.confidence 
    });
  }

  const viaStrictLLM = await routeWithLLM(input.message, ctxSlots, input.logger).catch(() => undefined);
  if (viaStrictLLM && viaStrictLLM.confidence > 0.5) {
    // Coerce to RouterResultT shape (missingSlots ignored by schema)
    const { intent, needExternal, slots, confidence } = viaStrictLLM;
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ intent, confidence, source: 'strict_llm' }, 'router_strict_llm_result');
    }

    // Simple weather override for obvious cases
    const isObviousWeather = /weather|temperature|climate/i.test(input.message);
    
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

    return RouterResult.parse({ intent, needExternal, slots: { ...finalSlots, ...slots }, confidence });
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
    input.logger.log.debug({ message: input.message.toLowerCase(), isUnrelated }, 'heuristic_check');
  }

  if (isUnrelated) {
    if (typeof input.logger?.log?.info === 'function') {
      input.logger.log.debug({ message: input.message.toLowerCase() }, 'heuristic_intent_unrelated_block_executed');
    }
    return RouterResult.parse({
      intent: 'unknown',
      needExternal: false,
      slots: finalSlots,
      confidence: 0.3
    });
  }

  // Fallback heuristic patterns (simplified)
  const m = input.message.toLowerCase();
  
  // Events/festivals should trigger web search (check first before attractions)
  if (/festival|event|concert|show|happening|going on|plan around/.test(m) && 
      !/attraction|museum|do in/.test(m)) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_web_search_events');
    }
    return RouterResult.parse({ 
      intent: 'web_search', 
      needExternal: true, 
      slots: { ...finalSlots, search_query: input.message }, 
      confidence: 0.8 
    });
  }
  
  if (/pack|bring|clothes|items|luggage|suitcase|wear|what to wear/.test(m) ||
      (m.includes('what about') && /kids|children|family/.test(m))) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_packing');
    }
    return RouterResult.parse({ intent: 'packing', ...base });
  }
  
  if (/attraction|do in|what to do|what should we do|museum|activities/.test(m)) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_attractions');
    }
    return RouterResult.parse({ intent: 'attractions', ...base });
  }
  
  if (/weather|what's the weather|what is the weather|temperature|forecast/.test(m)) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_weather');
    }
    return RouterResult.parse({ intent: 'weather', ...base });
  }
  
  if (/where should i go|destination|where to go|budget|options/.test(m)) {
    // Check if message has origin preposition to avoid treating origin as destination
    const hasOriginPreposition = /\b(?:from|out of|leaving|ex)\s+[A-Z]/i.test(input.message);
    if (hasOriginPreposition && finalSlots.originCity) {
      // Ensure we use originCity for destinations intent, not as destination
      finalSlots.city = finalSlots.originCity;
    }
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots, hasOriginPreposition }, 'heuristic_intent_destinations');
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
  
  const promptTemplate = await getPrompt('router_llm');
  const prompt = promptTemplate
    .replace('{instructions}', instructions)
    .replace('{message}', message);
  
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

function detectComplexQuery(message: string): { isComplex: boolean; confidence: number; reasoning: string } {
  const m = message || '';
  const categories: string[] = [];
  const hasOrigin = /\b(from|leaving|out of|ex)\s+[A-Z][A-Za-z]/.test(m);
  if (hasOrigin) categories.push('origin');
  const hasBudget = /(budget|cost|price|afford|cheap|expensive|\$\s*\d|£\s*\d|€\s*\d)/i.test(m);
  if (hasBudget) categories.push('budget');
  const hasGroup = /(\d+\s*(kids?|children|people|adults|family)|family|kids?)/i.test(m);
  if (hasGroup) categories.push('group');
  const hasTime = /(January|February|March|April|May|June|July|August|September|October|November|December|summer|winter|spring|fall|autumn|next\s+week|this\s+month|in\s+\w+)/i.test(m);
  if (hasTime) categories.push('time');
  const hasSpecial = /(visa|passport|wheelchair|accessible|accessibility|layover|stopovers?)/i.test(m);
  if (hasSpecial) categories.push('special');
  const score = Math.max(0, categories.length - 2);
  const confidence = Math.min(0.6 + 0.1 * score, 0.95);
  const isComplex = categories.length >= 3;
  return { isComplex, confidence, reasoning: `constraints: ${categories.join(', ')}` };
}
