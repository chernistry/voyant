import { RouterResult, RouterResultT } from '../schemas/router.js';
import { getPrompt } from './prompts.js';
import { z } from 'zod';
import { callLLM, classifyIntent, classifyContent, optimizeSearchQuery } from './llm.js';
import { extractEntities } from '../tools/ner.js';
import { parseDate, parseOriginDestination } from './parsers.js';
import { routeWithLLM } from './router.llm.js';
import { getThreadSlots, updateThreadSlots } from './slot_memory.js';
import { extractSlots } from './parsers.js';
import type pino from 'pino';

// No winkNLP; use regex + transformers signals

export async function routeIntent(input: { message: string; threadId?: string; logger?: { log: pino.Logger } }): Promise<RouterResultT> {
  if (typeof input.logger?.log?.info === 'function') {
    input.logger.log.debug({ message: input.message }, 'router_start');
  }

  // Handle edge cases before processing
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
  
  // COMPLEXITY CHECK FIRST - before any routing
  if (process.env.DEEP_RESEARCH_ENABLED === 'true') {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        deepResearchEnabled: true,
        message: input.message.substring(0, 100)
      }, '🔍 COMPLEXITY: Deep research enabled, checking complexity');
    }
    
    const complexity = await detectComplexQueryFast(input.message, input.logger?.log);
    
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        isComplex: complexity.isComplex,
        confidence: complexity.confidence,
        reasoning: complexity.reasoning
      }, '🔍 COMPLEXITY: Detection result');
    }
    
    if (complexity.isComplex && complexity.confidence >= 0.7) {
      if (input.threadId) {
        updateThreadSlots(input.threadId, {
          awaiting_deep_research_consent: 'true',
          pending_deep_research_query: input.message,
          complexity_reasoning: complexity.reasoning,
        }, []);
      }
      
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          intent: 'system',
          reason: 'deep_research_consent_needed'
        }, '✅ COMPLEXITY: Triggering deep research consent');
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

  // STEP 1: Try Transformers.js NLP first (should be primary method)
  if (typeof input.logger?.log?.debug === 'function') {
    input.logger.log.debug({ step: 1, method: 'transformers' }, '🤖 ROUTING_CASCADE: Attempting Transformers.js NLP');
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
  
  // Handle policy questions before explicit search
  if (contentClassification?.content_type === 'policy') {
    return RouterResult.parse({
      intent: 'policy',
      needExternal: true,
      slots: ctxSlots,
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
        step: 2,
        method: 'llm',
        intent: llmIntentResult.intent, 
        confidence: llmIntentResult.confidence, 
        source: 'llm_intent_classification',
        success: true
      }, '✅ ROUTING_CASCADE: LLM intent classification succeeded');
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
      input.logger.log.debug({ 
        step: 2,
        method: 'llm',
        submethod: 'strict_llm',
        intent, 
        confidence, 
        source: 'strict_llm',
        success: true
      }, '✅ ROUTING_CASCADE: Strict LLM succeeded');
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
      input.logger.log.debug({ 
        step: 2,
        method: 'llm',
        submethod: 'basic_llm',
        intent: viaLLM.intent, 
        confidence: viaLLM.confidence, 
        source: 'llm',
        success: true
      }, '✅ ROUTING_CASCADE: Basic LLM succeeded');
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

  // STEP 3: Final fallback to rule-based heuristics
  if (typeof input.logger?.log?.debug === 'function') {
    input.logger.log.debug({ step: 3, method: 'rules' }, '🤖 ROUTING_CASCADE: Falling back to rule-based heuristics');
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
  
  // Policy questions - check before other patterns
  if (/baggage|carry.?on|checked.?bag|luggage|personal.?item|refund|cancellation|change.?fee|rebooking|no.?show|check.?in|boarding|seat.?selection|fare.?rules|basic.?economy|visa|passport|entry.?requirements|esta|schengen/.test(m)) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_policy');
    }
    return RouterResult.parse({ 
      intent: 'policy', 
      needExternal: true, 
      slots: finalSlots, 
      confidence: 0.85 
    });
  }
  
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

async function detectComplexQueryFast(message: string, log?: any): Promise<{ isComplex: boolean; confidence: number; reasoning: string }> {
  const m = message || '';
  
  try {
    // Extract entities using Transformers.js
    const entities = await extractEntities(m, log);
    
    // Count constraint indicators
    const constraints = new Set<string>();
    
    // Entity-based constraints
    if (entities && entities.length > 0) {
      entities.forEach(entity => {
        const type = entity.entity_group?.toUpperCase() || '';
        if (/LOC|GPE|PLACE/.test(type)) constraints.add('location');
        if (/PER|PERSON/.test(type)) constraints.add('person');
        if (/DATE|TIME/.test(type)) constraints.add('time');
        if (/MONEY|CURRENCY/.test(type)) constraints.add('budget');
      });
    }
    
    // Text-based constraint detection
    const lower = m.toLowerCase();
    if (/[£$€]|\b(budget|cost|price|afford|expensive|cheap|spend|\$\d+)\b/.test(m)) constraints.add('budget');
    if (/\b(kids?|children|family|adults|people|toddler|parents|\d+\s*(year|month)s?\s*old)\b/.test(lower)) constraints.add('group');
    if (/\b(visa|passport|wheelchair|accessible|accessibility|layover|stopovers?|direct|connecting)\b/.test(lower)) constraints.add('special');
    if (/\b(hotel|accommodation|stay|night|room|airbnb)\b/.test(lower)) constraints.add('accommodation');
    if (/\b(flight|airline|airport|departure|arrival|from|to)\b/.test(lower)) constraints.add('transport');
    if (/\b(January|February|March|April|May|June|July|August|September|October|November|December|summer|winter|spring|fall|autumn|week|month|day)\b/i.test(m)) constraints.add('time');
    
    const entityCount = entities?.length || 0;
    const constraintCount = constraints.size;
    
    // Complexity scoring - multiple strategies
    const strategies = [
      // Strategy 1: High entity count (>4 entities = complex)
      { 
        isComplex: entityCount >= 4, 
        confidence: Math.min(0.7 + (entityCount - 4) * 0.05, 0.95),
        reason: `high_entity_count: ${entityCount} entities`
      },
      
      // Strategy 2: Multiple constraint types (>=3 = complex)
      { 
        isComplex: constraintCount >= 3, 
        confidence: Math.min(0.7 + (constraintCount - 3) * 0.1, 0.95),
        reason: `multiple_constraints: ${Array.from(constraints).join(', ')}`
      },
      
      // Strategy 3: Budget + Group + Location (family travel planning)
      { 
        isComplex: constraints.has('budget') && constraints.has('group') && constraints.has('location'), 
        confidence: 0.85,
        reason: 'family_travel_planning: budget+group+location'
      },
      
      // Strategy 4: Long query with multiple locations
      { 
        isComplex: m.length > 50 && entityCount >= 3 && constraints.has('location'), 
        confidence: 0.8,
        reason: `detailed_multi_location: ${m.length} chars, ${entityCount} entities`
      }
    ];
    
    // Find the best matching strategy
    const complexStrategy = strategies.find(s => s.isComplex);
    
    if (complexStrategy) {
      if (log?.debug) {
        log.debug({
          method: 'fast_transformers',
          entities: entityCount,
          constraints: Array.from(constraints),
          strategy: complexStrategy.reason,
          confidence: complexStrategy.confidence
        }, '🚀 COMPLEXITY: Fast detection - COMPLEX');
      }
      
      return { 
        isComplex: true, 
        confidence: complexStrategy.confidence, 
        reasoning: complexStrategy.reason 
      };
    }
    
    if (log?.debug) {
      log.debug({
        method: 'fast_transformers',
        entities: entityCount,
        constraints: Array.from(constraints),
        isComplex: false
      }, '🚀 COMPLEXITY: Fast detection - SIMPLE');
    }
    
    return { isComplex: false, confidence: 0.6, reasoning: `simple: ${entityCount} entities, ${constraintCount} constraints` };
    
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ COMPLEXITY: Fast detection failed');
    }
    
    // Fallback to simple heuristics
    const lower = m.toLowerCase();
    const hasMultipleIndicators = [
      /[£$€]|\$\d+/.test(m),
      /\b(kids?|children|family|\d+\s*year)/i.test(m),
      /\b(from|to)\b.*\b(from|to)\b/i.test(m),
      /\b(budget|cost|price)/i.test(m)
    ].filter(Boolean).length;
    
    return { 
      isComplex: hasMultipleIndicators >= 2, 
      confidence: 0.7, 
      reasoning: `fallback_heuristic: ${hasMultipleIndicators} indicators` 
    };
  }
}
async function detectComplexQuery(message: string, log?: any): Promise<{ isComplex: boolean; confidence: number; reasoning: string }> {
  const m = message || '';
  
  // Try Transformers.js first for entity-based complexity detection
  try {
    const entities = await extractEntities(m, log);
    
    if (entities && entities.length > 0) {
      const categories: string[] = [];
      const entityTypes = new Set<string>();
      
      // Analyze entities for complexity indicators
      entities.forEach(entity => {
        const type = entity.entity_group?.toUpperCase() || '';
        entityTypes.add(type);
        
        // Money/budget entities
        if (/MONEY|CURRENCY/.test(type) || /\$|€|£|\d+/.test(entity.text)) {
          categories.push('budget');
        }
        
        // Location entities
        if (/LOC|GPE|PLACE/.test(type)) {
          categories.push('location');
        }
        
        // Person/group entities
        if (/PER|PERSON/.test(type) || /\d+/.test(entity.text)) {
          categories.push('group');
        }
        
        // Date/time entities
        if (/DATE|TIME/.test(type)) {
          categories.push('time');
        }
      });
      
      // Add heuristic categories for missed patterns
      const lower = m.toLowerCase();
      if (/[£$€]/.test(m) || /\b(budget|cost|price|afford|expensive|cheap|spend|currency|exchange)\b/.test(lower)) categories.push('budget');
      if (/\b(kids?|children|family|adults|people|toddler|parents)\b/.test(lower) || /\b\d+\b/.test(lower)) categories.push('group');
      if (/\b(visa|passport|wheelchair|accessible|accessibility|layover|stopovers?)\b/.test(lower)) categories.push('special');
      
      const uniqueCategories = Array.from(new Set(categories));
      const entityDiversity = entityTypes.size;
      const totalEntities = entities.length;
      
      // Complexity scoring based on Transformers analysis
      const categoryScore = Math.max(0, uniqueCategories.length - 2);
      const entityScore = Math.min(entityDiversity * 0.2, 0.4);
      const densityScore = Math.min(totalEntities * 0.1, 0.3);
      
      const confidence = Math.min(0.6 + categoryScore * 0.1 + entityScore + densityScore, 0.95);
      const isComplex = uniqueCategories.length >= 3 || (uniqueCategories.length >= 2 && totalEntities >= 4);
      
      if (log?.debug) {
        log.debug({
          method: 'transformers',
          entities: entities.length,
          entityTypes: Array.from(entityTypes),
          categories: uniqueCategories,
          confidence,
          isComplex
        }, '🤖 COMPLEXITY: Transformers-based detection');
      }
      
      if (isComplex) {
        return { 
          isComplex, 
          confidence, 
          reasoning: `transformers: entities=${totalEntities}, types=${Array.from(entityTypes).join(',')}, constraints=${uniqueCategories.join(', ')}` 
        };
      }
    }
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ COMPLEXITY: Transformers detection failed');
    }
  }
  
  // Fallback to heuristic + LLM detection
  const categories: string[] = [];
  try {
    const lower = m.toLowerCase();
    if (/[£$€]/.test(m) || /\b(budget|cost|price|afford|expensive|cheap|spend|currency|exchange)\b/.test(lower)) categories.push('budget');
    if (/\b(kids?|children|family|adults|people|toddler|parents)\b/.test(lower) || /\b\d+\b/.test(lower)) categories.push('group');
    const date = await parseDate(m).catch(() => ({ success: false } as const));
    if ((date as any).success) categories.push('time');
    const od = await parseOriginDestination(m).catch(() => ({ success: false } as const));
    if ((od as any).success && ((od as any).data?.originCity || (od as any).data?.destinationCity)) categories.push('origin');
    if (/\b(visa|passport|wheelchair|accessible|accessibility|layover|stopovers?)\b/.test(lower)) categories.push('special');
    
    const uniq = Array.from(new Set(categories));
    const score = Math.max(0, uniq.length - 2);
    const confidence = Math.min(0.6 + 0.1 * score, 0.95);
    const isComplex = uniq.length >= 3;
    
    if (log?.debug) {
      log.debug({
        method: 'heuristic',
        categories: uniq,
        confidence,
        isComplex
      }, '🔍 COMPLEXITY: Heuristic detection');
    }
    
    if (isComplex) return { isComplex, confidence, reasoning: `heuristic: constraints=${uniq.join(', ')}` };
  } catch {}
  
  // Final LLM fallback with JSON
  try {
    const template = await getPrompt('complexity_assessor');
    const prompt = template.replace('{message}', m);
    const raw = await callLLM(prompt, { responseFormat: 'json', log });
    const json = JSON.parse(raw);
    const schema = z.object({ isComplex: z.boolean(), confidence: z.number().min(0).max(1), reasoning: z.string() });
    const result = schema.parse(json);
    
    if (log?.debug) {
      log.debug({
        method: 'llm_fallback',
        ...result
      }, '🤖 COMPLEXITY: LLM fallback detection');
    }
    
    return result;
  } catch {}
  
  return { isComplex: false, confidence: 0.4, reasoning: 'insufficient_signal' };
}

async function tryRouteViaTransformers(message: string, threadId?: string, log?: pino.Logger): Promise<RouterResultT | undefined> {
  try {
    // Extract entities using Transformers.js NER
    const entities = await extractEntities(message, log);
    
    if (log?.debug) {
      log.debug({ 
        entities: entities.map(e => ({ type: e.entity_group, text: e.text, score: e.score })),
        count: entities.length 
      }, '🔍 TRANSFORMERS: Extracted entities');
    }

    // Get thread context for slot merging
    const ctxSlots = threadId ? getThreadSlots(threadId) : {};
    
    // Extract slots using our parsers (which now use Transformers internally)
    const extractedSlots = await extractSlots(message, ctxSlots, log);
    
    // Simple rule-based intent classification based on entities and patterns
    const intent = classifyIntentFromEntities(message, entities, extractedSlots, log);
    
    if (intent && intent.confidence > 0.7) {
      return RouterResult.parse({
        intent: intent.intent,
        needExternal: intent.needExternal,
        slots: { ...ctxSlots, ...extractedSlots },
        confidence: intent.confidence
      });
    }
    
    return undefined;
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ TRANSFORMERS: Failed to route via Transformers');
    }
    return undefined;
  }
}

function classifyIntentFromEntities(
  message: string, 
  entities: any[], 
  slots: any, 
  log?: pino.Logger
): { intent: string; needExternal: boolean; confidence: number } | undefined {
  const m = message.toLowerCase();
  
  // Weather patterns - prioritize explicit weather keywords
  if (/\b(weather|temperature|climate|forecast|rain|sunny|cloudy|hot|cold|degrees?)\b/i.test(m) || 
      /what'?s?\s+(the\s+)?weather/i.test(m)) {
    const hasLocation = entities.some(e => /LOC|GPE/i.test(e.entity_group)) || slots.city;
    if (log?.debug) {
      log.debug({ 
        pattern: 'weather', 
        hasLocation, 
        entities: entities.length,
        confidence: 0.95,
        reason: 'explicit_weather_keywords'
      }, '🎯 TRANSFORMERS: Weather intent detected');
    }
    return { intent: 'weather', needExternal: true, confidence: 0.95 };
  }
  
  // Attractions with location
  if (/attraction|do in|what to do|museum|activities/.test(m)) {
    const hasLocation = entities.some(e => /LOC|GPE/i.test(e.entity_group)) || slots.city;
    if (log?.debug) {
      log.debug({ 
        pattern: 'attractions', 
        hasLocation, 
        confidence: hasLocation ? 0.8 : 0.6
      }, '🎯 TRANSFORMERS: Attractions intent detected');
    }
    return { intent: 'attractions', needExternal: false, confidence: hasLocation ? 0.8 : 0.6 };
  }
  
  // Packing advice
  if (/pack|bring|clothes|items|luggage|suitcase|wear/.test(m)) {
    if (log?.debug) {
      log.debug({ pattern: 'packing', confidence: 0.8 }, '🎯 TRANSFORMERS: Packing intent detected');
    }
    return { intent: 'packing', needExternal: false, confidence: 0.8 };
  }
  
  // Country information queries
  if (/tell me about.*(?:country|spain|france|italy|germany|japan|canada|australia|brazil|mexico|india|china|russia|uk|usa|america)/i.test(m) || 
      /(?:spain|france|italy|germany|japan|canada|australia|brazil|mexico|india|china|russia).*(?:country|as a country)/i.test(m)) {
    if (log?.debug) {
      log.debug({ pattern: 'country_info', confidence: 0.9 }, '🎯 TRANSFORMERS: Country information intent detected');
    }
    return { intent: 'destinations', needExternal: true, confidence: 0.9 };
  }
  
  // Destinations with origin detection
  if (/where should i go|destination|where to go|budget|options/.test(m)) {
    const hasOrigin = entities.some(e => /LOC|GPE/i.test(e.entity_group)) || slots.originCity;
    if (log?.debug) {
      log.debug({ 
        pattern: 'destinations', 
        hasOrigin, 
        confidence: hasOrigin ? 0.8 : 0.6
      }, '🎯 TRANSFORMERS: Destinations intent detected');
    }
    return { intent: 'destinations', needExternal: false, confidence: hasOrigin ? 0.8 : 0.6 };
  }
  
  if (log?.debug) {
    log.debug({ 
      message: m.substring(0, 50),
      entityCount: entities.length,
      reason: 'no_pattern_match'
    }, '❓ TRANSFORMERS: No intent pattern matched');
  }
  
  return undefined;
}
