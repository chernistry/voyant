import { RouterResult, RouterResultT } from '../schemas/router.js';
import { getPrompt } from './prompts.js';
import { z } from 'zod';
import { callLLM, classifyIntent, classifyContent, optimizeSearchQuery } from './llm.js';
import { extractEntities } from './ner.js';
import { parseDate, parseOriginDestination } from './parsers.js';
import { routeWithLLM } from './router.llm.js';
import { getThreadSlots, updateThreadSlots } from './slot_memory.js';
import { extractSlots } from './parsers.js';
import type pino from 'pino';
import { transformersEnabled } from '../config/transformers.js';

// No winkNLP; use regex + transformers signals

// AI-first flight query complexity detection
async function isDirectFlightQuery(message: string, logger?: any): Promise<{
  isDirect: boolean;
  confidence: number;
  reasoning: string;
}> {
  try {
    const tpl = await getPrompt('flight_complexity_detector');
    const prompt = tpl.replace('{message}', message);
    const response = await callLLM(prompt, { responseFormat: 'json', log: logger });
    const parsed = JSON.parse(response);
    
    return {
      isDirect: parsed.isDirect || false,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || 'Unable to determine complexity'
    };
  } catch (error) {
    if (logger?.debug) {
      logger.debug({ error: String(error) }, 'Flight complexity detection failed');
    }
    return {
      isDirect: false,
      confidence: 0.3,
      reasoning: 'Analysis failed, defaulting to complex planning'
    };
  }
}

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

  // Use LLM for content classification first (kept for early overrides like system/policy/search)
  const contentClassification = await classifyContent(input.message, input.logger?.log);
  
  // Handle flight content classification with complexity detection BEFORE deep research
  if (contentClassification && contentClassification.content_type === 'flight') {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        contentType: contentClassification?.content_type,
        message: input.message.substring(0, 100)
      }, '✈️ FLIGHTS: Content classified as flight, analyzing complexity');
    }
    
    // Determine if this is a direct flight search or complex travel planning
    const isDirectFlightSearch = await isDirectFlightQuery(input.message, input.logger?.log);
    
    if (isDirectFlightSearch.isDirect && isDirectFlightSearch.confidence > 0.7) {
      // Direct flight search → Route to Amadeus API
      const flightSlots = await extractSlots(input.message, {}, input.logger?.log);
      
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          isDirect: true,
          confidence: isDirectFlightSearch.confidence,
          slots: flightSlots
        }, '✈️ FLIGHTS: Direct flight search detected, routing to Amadeus API');
      }
      
      return RouterResult.parse({
        intent: 'flights',
        needExternal: true,
        slots: flightSlots,
        confidence: 0.9
      });
    } else if (!isDirectFlightSearch.isDirect && isDirectFlightSearch.confidence > 0.7) {
      // Complex travel planning → Route to web search/deep research
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          isDirect: false,
          confidence: isDirectFlightSearch.confidence,
          reasoning: isDirectFlightSearch.reasoning
        }, '✈️ FLIGHTS: Complex travel planning detected, routing to web search');
      }
      
      return RouterResult.parse({
        intent: 'web_search',
        needExternal: true,
        slots: { search_query: input.message },
        confidence: 0.9
      });
    } else {
      // Ambiguous → Ask for clarification with specific options
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          confidence: isDirectFlightSearch.confidence,
          reasoning: isDirectFlightSearch.reasoning
        }, '✈️ FLIGHTS: Ambiguous flight query, asking for clarification');
      }
      
      if (input.threadId) {
        updateThreadSlots(input.threadId, {
          awaiting_flight_clarification: 'true',
          pending_flight_query: input.message,
          clarification_reasoning: isDirectFlightSearch.reasoning,
        }, []);
      }
      
      return RouterResult.parse({
        intent: 'system',
        needExternal: false,
        slots: {
          flight_clarification_needed: 'true',
          ambiguity_reason: isDirectFlightSearch.reasoning,
          clarification_options: 'direct_search_or_web_research',
        },
        confidence: 0.9,
      });
    }
  }
  
  // Debug environment variables
  if (typeof input.logger?.log?.debug === 'function') {
    input.logger.log.debug({
      DEEP_RESEARCH_ENABLED: process.env.DEEP_RESEARCH_ENABLED,
      shouldCheckComplexity: process.env.DEEP_RESEARCH_ENABLED === 'true'
    }, '🔧 ROUTER: Environment check');
  }
  
  // COMPLEXITY CHECK ONLY FOR NON-FLIGHT QUERIES
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

  // STEP 1: Try Transformers.js NLP first (actual execution with short timeout)
  if (transformersEnabled()) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ step: 1, method: 'transformers' },
        '🤖 ROUTING_CASCADE: Attempting Transformers.js NLP');
    }

    const transformersFast = await routeViaTransformersFirst(
      input.message,
      input.threadId,
      input.logger,
    );
    if (transformersFast) {
      // Short-circuit on high confidence from Transformers path
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({
          step: 1,
          method: 'transformers',
          submethod: 'transformers_fast',
          success: true,
          intent: transformersFast.intent,
          confidence: transformersFast.confidence,
        }, '✅ ROUTING_CASCADE: Transformers path succeeded');
      }
      return RouterResult.parse(transformersFast);
    }
  } else if (typeof input.logger?.log?.debug === 'function') {
    input.logger.log.debug({ step: 1 },
      '🤖 ROUTING_CASCADE: Transformers disabled');
  }
  
  // Prefer LLM router first for robust NLU and slot extraction
  const ctxSlots = input.threadId ? getThreadSlots(input.threadId) : {};
  
  // Handle flight clarification responses
  if (ctxSlots.awaiting_flight_clarification === 'true' && input.threadId) {
    const userResponse = input.message.toLowerCase().trim();
    const pendingQuery = ctxSlots.pending_flight_query || '';
    
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        userResponse,
        pendingQuery: pendingQuery.substring(0, 100)
      }, '✈️ FLIGHTS: Processing clarification response');
    }
    
    // Clear the clarification state
    updateThreadSlots(input.threadId, {}, [
      'awaiting_flight_clarification',
      'pending_flight_query',
      'clarification_reasoning',
      'flight_clarification_needed',
      'clarification_options'
    ]);
    
    // Route based on user's choice
    if (userResponse.includes('direct') || userResponse.includes('search') || userResponse.includes('booking')) {
      // User wants direct flight search
      const flightSlots = await extractSlots(pendingQuery, ctxSlots, input.logger?.log);
      
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          choice: 'direct_search',
          slots: flightSlots
        }, '✈️ FLIGHTS: User chose direct search, routing to Amadeus API');
      }
      
      return RouterResult.parse({
        intent: 'flights',
        needExternal: true,
        slots: { ...ctxSlots, ...flightSlots },
        confidence: 0.9
      });
    } else if (userResponse.includes('research') || userResponse.includes('planning') || userResponse.includes('advice')) {
      // User wants travel research
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          choice: 'web_research'
        }, '✈️ FLIGHTS: User chose travel research, routing to web search');
      }
      
      return RouterResult.parse({
        intent: 'web_search',
        needExternal: true,
        slots: { ...ctxSlots, search_query: pendingQuery },
        confidence: 0.9
      });
    } else {
      // Ambiguous response, try to process the original query again
      if (typeof input.logger?.log?.debug === 'function') {
        input.logger.log.debug({ 
          choice: 'ambiguous_retry'
        }, '✈️ FLIGHTS: Ambiguous clarification response, retrying original query');
      }
      
      // Recursively process the original query
      return routeIntent({ 
        message: pendingQuery, 
        threadId: input.threadId, 
        logger: input.logger 
      });
    }
  }
  
  // Handle system questions about the AI
  if (contentClassification?.content_type === 'system') {
    return RouterResult.parse({
      intent: 'system',
      needExternal: false,
      slots: {},
      confidence: 0.9
    });
  }
  
  // Handle visa questions early (before Transformers can misclassify as destinations)
  if (/\b(visa|passport|entry requirements?|immigration)\b/i.test(input.message)) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        message: input.message.substring(0, 100),
        reason: 'visa_keyword_detected'
      }, '🏛️ POLICY: Early visa detection, routing to RAG system');
    }
    return RouterResult.parse({
      intent: 'policy',
      needExternal: true,
      slots: ctxSlots,
      confidence: 0.9
    });
  }
  
  // Handle policy questions before explicit search (with safety check)
  if (contentClassification?.content_type === 'policy') {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ 
        contentType: contentClassification?.content_type,
        message: input.message.substring(0, 100)
      }, '🏛️ POLICY: Routing to RAG system');
    }
    return RouterResult.parse({
      intent: 'policy',
      needExternal: true,
      slots: ctxSlots,
      confidence: 0.9
    });
  }
  
  // Handle explicit search commands early (but not for policy questions)
  if (contentClassification?.is_explicit_search && (contentClassification as any).content_type !== 'policy') {
    // Use original message as search query
    const searchQuery = input.message.trim();
    
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

  // Skip extremely long words (likely spam)
  if (input.message.length > 200) {
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

    // AI-first: Trust LLM classification, no hardcoded overrides

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

    // AI-first: Trust LLM classification completely

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
  
  // AI-first policy detection - use LLM classification
  const policyClassification = await classifyContent(input.message, input.logger?.log);
  if (policyClassification?.content_type === 'policy' || 
      (policyClassification && input.message.toLowerCase().includes('policy'))) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'ai_intent_policy');
    }
    return RouterResult.parse({ 
      intent: 'policy', 
      needExternal: true, 
      slots: finalSlots, 
      confidence: 0.85 
    });
  }
  
  // AI-first event detection - use intent classification
  const intentClassification = await classifyIntent(input.message, {}, input.logger?.log);
  if (intentClassification?.intent === 'web_search' && (intentClassification.confidence || 0) > 0.6) {
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
  
  // AI-first flight detection
  if (intentClassification?.intent === 'flights' && (intentClassification.confidence || 0) > 0.6) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_flights');
    }
    return RouterResult.parse({ intent: 'flights', needExternal: true, slots: finalSlots, confidence: 0.8 });
  }
  
  // AI-first packing detection - use intent classification
  if (intentClassification?.intent === 'packing' && (intentClassification.confidence || 0) > 0.6) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_packing');
    }
    return RouterResult.parse({ intent: 'packing', ...base });
  }
  
  // AI-first attractions detection
  if (intentClassification?.intent === 'attractions' && (intentClassification.confidence || 0) > 0.6) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_attractions');
    }
    return RouterResult.parse({ intent: 'attractions', ...base });
  }
  
  // AI-first weather detection
  if (intentClassification?.intent === 'weather' && (intentClassification.confidence || 0) > 0.6) {
    if (typeof input.logger?.log?.debug === 'function') {
      input.logger.log.debug({ slots: finalSlots }, 'heuristic_intent_weather');
    }
    return RouterResult.parse({ intent: 'weather', ...base });
  }
  
  // AI-first destinations detection
  if (intentClassification?.intent === 'destinations' && (intentClassification.confidence || 0) > 0.6) {
    // Check if message has origin preposition to avoid treating origin as destination
    const hasOriginPreposition = /from/.test(input.message);
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

/**
 * Transformers-first fast routing with a strict timeout. Returns undefined on timeout
 * or low confidence so the cascade can proceed to LLM and rules.
 */
export async function routeViaTransformersFirst(
  message: string,
  threadId?: string,
  logger?: { log: pino.Logger },
): Promise<RouterResultT | undefined> {
  const log = logger?.log;
  const timeoutMs = Math.max(100, Number(process.env.TRANSFORMERS_ROUTER_TIMEOUT_MS ?? '3000')); // Increased from 2000ms
  
  if (log?.debug) {
    log.debug({
      timeoutMs,
      envValue: process.env.TRANSFORMERS_ROUTER_TIMEOUT_MS,
      message: message.substring(0, 50)
    }, '⏱️ TRANSFORMERS: Timeout configuration');
  }
  let timedOut = false;

  const timer = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(undefined);
    }, timeoutMs);
  });

  const started = Date.now();
  const result = await Promise.race([
    tryRouteViaTransformers(message, threadId, log),
    timer,
  ]);
  const durationMs = Date.now() - started;

  if (!result) {
    if (log?.debug) {
      log.debug({
        step: 1,
        method: 'transformers',
        success: false,
        reason: timedOut ? 'timeout' : 'low_confidence_or_no_match',
        durationMs,
      }, '⚠️ ROUTING_CASCADE: Transformers path skipped');
    }
    return undefined;
  }

  if (result.confidence >= 0.7) {
    // Success path already logs at caller; include submethod for completeness
    if (log?.debug) {
      log.debug({
        step: 1,
        method: 'transformers',
        submethod: 'transformers_fast',
        success: true,
        durationMs,
        intent: result.intent,
        confidence: result.confidence,
      }, '✅ ROUTING_CASCADE: Transformers path accepted');
    }
    return RouterResult.parse(result);
  }

  if (log?.debug) {
    log.debug({
      step: 1,
      method: 'transformers',
      success: false,
      reason: 'below_threshold',
      confidence: result.confidence,
      durationMs,
    }, '⚠️ ROUTING_CASCADE: Transformers result below threshold');
  }
  return undefined;
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
    // Get AI classification for complexity detection
    const intentClassification = await classifyIntent(message, {}, log);
    
    // Extract entities using Transformers.js
    const entities = await extractEntities(m, log);
    
    // Count constraint indicators
    const constraints = new Set<string>();
    
    // Entity-based constraints - use AI classification for entity types
    if (entities && entities.length > 0) {
      for (const entity of entities) {
        const type = entity.entity_group?.toUpperCase() || '';
        // Use AI classification for entity categorization with fallback to regex
        const entityClassification = await classifyContent(entity.text, log);
        if (entityClassification?.confidence && entityClassification.confidence > 0.7) {
          entityClassification.categories?.forEach(cat => constraints.add(cat));
        } else {
          // Minimal fallback
          if (/LOC|GPE|PLACE/.test(type)) constraints.add('location');
          if (/PER|PERSON/.test(type)) constraints.add('person');
          if (/DATE|TIME/.test(type)) constraints.add('time');
          if (/MONEY|CURRENCY/.test(type)) constraints.add('budget');
        }
      }
    }
    
    // AI-first constraint detection
    const constraintClassification = await classifyContent(m, log);
    if (constraintClassification?.categories && constraintClassification.categories.length > 0) {
      constraintClassification.categories.forEach(cat => constraints.add(cat));
    }

    // Minimal fallback for critical patterns only if AI didn't detect anything
    if (constraints.size === 0) {
      const lower = m.toLowerCase();
      if (/[£$€]|\$\d+/.test(m)) constraints.add('budget');
      if (/\b(from|to)\b.*\b(from|to)\b/i.test(m)) constraints.add('transport');
    }
    
    // AI-first complexity detection - use constraint count and confidence
    const constraintCount = constraints.size;
    const isSimpleQuery = constraintCount <= 1 && (intentClassification?.confidence || 0) > 0.8;
    
    // Derive simple query types from AI classification
    const isSimpleWeather = intentClassification?.intent === 'weather';
    const isSimplePacking = intentClassification?.intent === 'packing';
    
    if (isSimpleQuery) {
      if (log?.debug) {
        log.debug({ 
          message: m.substring(0, 100),
          reason: 'simple_query_ai_confident',
          constraints: constraintCount,
          confidence: intentClassification?.confidence || 0
        }, '🌤️ COMPLEXITY: Simple query - not complex');
      }
      return { 
        isComplex: false, 
        confidence: 0.9, 
        reasoning: isSimpleWeather ? 'simple_weather_query' : 
                   isSimplePacking ? 'simple_packing_query' : 'simple_attractions_query'
      };
    }
    
    const entityCount = entities?.length || 0;
    
    // Complexity scoring - multiple strategies
    const strategies = [
      // Strategy 1: Use AI confidence and constraint count for complexity detection
      { 
        isComplex: (intentClassification?.confidence || 0) < 0.6 || constraintCount > 2, 
        confidence: Math.min(0.7 + (constraintCount > 2 ? (constraintCount - 2) * 0.1 : 0), 0.95),
        reason: `ai_confidence_low_or_many_constraints: confidence=${intentClassification?.confidence || 0}, constraints=${constraintCount}`
      },
      
      // Strategy 2: High entity count (>4 entities = complex)
      { 
        isComplex: entityCount >= 4, 
        confidence: Math.min(0.7 + (entityCount - 4) * 0.05, 0.95),
        reason: `high_entity_count: ${entityCount} entities`
      },
      
      // Strategy 2: Multiple constraint types (>=4 = complex)
      { 
        isComplex: constraintCount >= 4, 
        confidence: Math.min(0.7 + (constraintCount - 4) * 0.1, 0.95),
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
    
    // Initialize constraints set
    const constraints = new Set<string>();
    
    // AI-first constraint detection
    const constraintClassification = await classifyContent(m, log);
    if (constraintClassification?.categories) {
      constraintClassification.categories.forEach(cat => constraints.add(cat));
    }

    // Minimal fallback for critical patterns only
    if (constraints.size === 0) {
      const lower = m.toLowerCase();
      if (/[£$€]|\$\d+/.test(m)) constraints.add('budget');
      if (/\b(from|to)\b.*\b(from|to)\b/i.test(m)) constraints.add('transport');
    }
    
    const constraintCount = constraints.size;
    
    // AI-first fallback using classifyIntent for complexity detection
    const intentClassification = await classifyIntent(message, {}, log);
    
    // Use AI confidence scoring instead of regex counting
    const complexityScore = await classifyIntent(message, {}, log);
    const isComplex = (complexityScore?.confidence || 0) < 0.6 || constraints.size > 2;
    const confidence = Math.min(0.7 + (constraints.size > 2 ? (constraints.size - 2) * 0.1 : 0), 0.95);
    
    if (isComplex) {
      return { 
        isComplex: true, 
        confidence, 
        reasoning: `ai_confidence_scoring: confidence=${complexityScore?.confidence || 0}, constraints=${constraints.size}` 
      };
    }
    
    return { 
      isComplex: false, 
      confidence: 0.7, 
      reasoning: `ai_confidence_scoring: confidence=${complexityScore?.confidence || 0}, constraints=${constraints.size}` 
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
      if (/[£$€]/.test(m) || /budget|cost|price/.test(lower)) categories.push('budget');
      if (/family|children|adults/.test(lower)) categories.push('group');
      if (/visa|passport/.test(lower)) categories.push('special');
      
      const uniqueCategories = Array.from(new Set(categories));
      const entityDiversity = entityTypes.size;
      const totalEntities = entities.length;
      
      // Complexity scoring based on Transformers analysis
      const categoryScore = Math.max(0, uniqueCategories.length - 2);
      const entityScore = Math.min(entityDiversity * 0.2, 0.4);
      const densityScore = Math.min(totalEntities * 0.1, 0.3);
      
      const confidence = Math.min(0.6 + categoryScore * 0.1 + entityScore + densityScore, 0.95);
      const isComplex = uniqueCategories.length >= 4 || (uniqueCategories.length >= 3 && totalEntities >= 6);
      
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
    if (/[£$€]/.test(m) || /budget|cost|price/.test(lower)) categories.push('budget');
    if (/family|children|adults/.test(lower)) categories.push('group');
    const date = await parseDate(m).catch(() => ({ success: false } as const));
    if ((date as any).success) categories.push('time');
    const od = await parseOriginDestination(m).catch(() => ({ success: false } as const));
    if ((od as any).success && ((od as any).data?.originCity || (od as any).data?.destinationCity)) categories.push('origin');
    if (/visa|passport/.test(lower)) categories.push('special');
    
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
    const result = schema.parse(json) as { isComplex: boolean; confidence: number; reasoning: string };
    
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
    // Use enhanced NER for better entity extraction
    const { extractEntitiesEnhanced } = await import('./ner-enhanced.js');
    const entityResult = await extractEntitiesEnhanced(message, log);
    
    // Use transformers-based intent classification
    const { classifyIntent } = await import('./transformers-classifier.js');
    const intentResult = await classifyIntent(message, log);
    
    if (log?.debug) {
      log.debug({ 
        entities: entityResult.entities.length,
        locations: entityResult.locations.length,
        intent: intentResult.intent,
        confidence: intentResult.confidence
      }, '🔍 TRANSFORMERS: Enhanced processing complete');
    }

    // Get thread context for slot merging
    const ctxSlots = threadId ? getThreadSlots(threadId) : {};
    
    // Extract slots using our parsers (which now use Transformers internally)
    const extractedSlots = await extractSlots(message, ctxSlots, log);
    
    // Enhanced intent classification based on transformers results
    const intent = await classifyIntentFromTransformers(message, intentResult, entityResult, extractedSlots, log);
    
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

async function classifyIntentFromTransformers(
  message: string, 
  intentResult: any,
  entityResult: any,
  slots: any, 
  log?: pino.Logger
): Promise<{ intent: string; needExternal: boolean; confidence: number } | undefined> {
  
  if (log?.debug) {
    log.debug({
      message: message.substring(0, 50),
      intentResult,
      entityResult: {
        totalEntities: entityResult.entities.length,
        locations: entityResult.locations.length,
        locationTexts: entityResult.locations.map((l: any) => l.text)
      },
      slots
    }, '🔍 TRANSFORMERS: Detailed classification input');
  }
  
  // Enhanced pattern matching with Russian support - check attractions FIRST
  const m = message.toLowerCase();
  
  // Attractions with enhanced location detection (prioritize over destinations)
  // AI-first: Use intent classification first
  const attractionsIntent = await classifyIntent(message, {}, log);
  if (attractionsIntent?.intent === 'attractions' && (attractionsIntent.confidence || 0) > 0.6) {
    const hasLocation = entityResult.locations.length > 0 || slots.city;
    const confidence = hasLocation ? 0.9 : 0.7;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'attractions', 
        hasLocation, 
        confidence 
      }, '🎯 TRANSFORMERS: Attractions intent detected');
    }
    return { intent: 'attractions', needExternal: false, confidence };
  }
  // Micro rules for attractions
  if (/attraction|museum|activities/.test(m)) {
    const hasLocation = entityResult.locations.length > 0 || slots.city;
    const confidence = hasLocation ? 0.9 : 0.7;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'attractions_regex_fallback', 
        hasLocation, 
        confidence 
      }, '🎯 TRANSFORMERS: Attractions intent detected (regex fallback)');
    }
    return { intent: 'attractions', needExternal: false, confidence };
  }
  
  // Use transformers intent classification as primary signal (after attractions check)
  if (intentResult.confidence > 0.8) {
    
    const needExternal = determineExternalNeed(intentResult.intent, entityResult, slots);
    
    if (log?.debug) {
      log.debug({ 
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        needExternal,
        reason: 'transformers_high_confidence'
      }, '🎯 TRANSFORMERS: High confidence intent classification');
    }
    
    return { 
      intent: intentResult.intent, 
      needExternal, 
      confidence: intentResult.confidence 
    };
  }
  
  // Weather patterns - enhanced with Russian
  // AI-first: Use intent classification first
  const weatherIntent = await classifyIntent(message, {}, log);
  if (weatherIntent?.intent === 'weather' && (weatherIntent.confidence || 0) > 0.6) {
    const hasLocation = entityResult.locations.length > 0 || slots.city || /\\b(в|in)\\s+\\w+/i.test(message);
    const confidence = hasLocation ? 0.95 : 0.8;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'weather_ai_first', 
        hasLocation, 
        locations: entityResult.locations.length,
        confidence,
        reason: 'ai_classification_with_russian_support'
      }, '🎯 TRANSFORMERS: Weather intent detected');
    }
    return { intent: 'weather', needExternal: true, confidence };
  }
  // Micro rules for weather
  if (/weather|temperature/.test(m)) {
    const hasLocation = entityResult.locations.length > 0 || slots.city || /\\b(в|in)\\s+\\w+/i.test(message);
    const confidence = hasLocation ? 0.95 : 0.8;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'weather_regex_fallback', 
        hasLocation, 
        locations: entityResult.locations.length,
        confidence,
        reason: 'enhanced_pattern_matching_with_russian',
        russianPattern: /погода/i.test(m)
      }, '🎯 TRANSFORMERS: Weather intent detected (regex fallback)');
    }
    return { intent: 'weather', needExternal: true, confidence };
  }
  
  // Packing advice with duration context
  // AI-first: Use intent classification first
  const packingIntent = await classifyIntent(message, {}, log);
  if (packingIntent?.intent === 'packing' && (packingIntent.confidence || 0) > 0.6) {
    const hasDuration = entityResult.durations.length > 0;
    const confidence = hasDuration ? 0.9 : 0.8;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'packing', 
        hasDuration,
        confidence 
      }, '🎯 TRANSFORMERS: Packing intent detected');
    }
    return { intent: 'packing', needExternal: false, confidence };
  }
  // Fallback to regex for critical patterns
  if (intentResult.intent === 'packing' && intentResult.confidence > 0.6) {
    const hasDuration = entityResult.durations.length > 0;
    const confidence = hasDuration ? 0.9 : 0.8;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'packing_regex_fallback', 
        hasDuration,
        confidence 
      }, '🎯 TRANSFORMERS: Packing intent detected (regex fallback)');
    }
    return { intent: 'packing', needExternal: false, confidence };
  }
  
  // Destinations with enhanced pattern matching
  // AI-first: Use intent classification first
  const destinationsIntent = await classifyIntent(message, {}, log);
  if (destinationsIntent?.intent === 'destinations' && (destinationsIntent.confidence || 0) > 0.6) {
    const confidence = 0.85;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'destinations', 
        confidence 
      }, '🎯 TRANSFORMERS: Destinations intent detected');
    }
    return { intent: 'destinations', needExternal: true, confidence };
  }
  // Micro rules for destinations
  if (/destination|where/.test(m)) {
    const confidence = 0.85;
    
    if (log?.debug) {
      log.debug({ 
        pattern: 'destinations_regex_fallback', 
        confidence 
      }, '🎯 TRANSFORMERS: Destinations intent detected (regex fallback)');
    }
    return { intent: 'destinations', needExternal: true, confidence };
  }
  
  return undefined;
}

function determineExternalNeed(intent: string, entityResult: any, slots: any): boolean {
  switch (intent) {
    case 'weather':
    case 'destinations':
      return true;
    case 'attractions':
      // Need external data if we have a specific location
      return entityResult.locations.length > 0 || !!slots.city;
    case 'packing':
      // Usually don't need external data for packing advice
      return false;
    default:
      return false;
  }
}
