import { RouterResult, RouterResultT } from '../schemas/router.js';
import { getPrompt } from './prompts.js';
import { callLLM, optimizeSearchQuery, classifyContent, classifyIntent } from './llm.js';
import { extractEntities } from './ner.js';
import { getThreadSlots, updateThreadSlots } from './slot_memory.js';
import { extractSlots } from './parsers.js';
import { transformersEnabled } from '../config/transformers.js';
import { RE, isDirectFlightHeuristic, cheapComplexity } from './router.optimizers.js';
import type pino from 'pino';

// Helper function to clear consent state for unrelated queries
function clearConsentState(threadId?: string) {
  if (!threadId) return;
  updateThreadSlots(threadId, {
    awaiting_deep_research_consent: '',
    pending_deep_research_query: '',
    awaiting_web_search_consent: '',
    pending_web_search_query: '',
    awaiting_search_consent: '',
    pending_search_query: ''
  }, []);
}

export async function routeIntent({ message, threadId, logger }: {
  message: string; 
  threadId?: string; 
  logger?: {log: pino.Logger}
}): Promise<RouterResultT> {
  logger?.log?.debug({ message }, 'router_start');
  const m = message.trim();

  // 0) Guards (no LLM) - clear consent state for unrelated queries
  if (!m) return RouterResult.parse({ intent:'unknown', needExternal:false, slots:{}, confidence:0.1 });
  
  if (RE.sys.test(m)) {
    clearConsentState(threadId);
    return RouterResult.parse({ intent:'system', needExternal:false, slots:{}, confidence:0.9 });
  }
  
  if (RE.policy.test(m)) {
    clearConsentState(threadId);
    return RouterResult.parse({ intent:'policy', needExternal:true, slots:{}, confidence:0.9 });
  }
  
  if (RE.explicitSearch.test(m)) {
    clearConsentState(threadId);
    const q = await optimizeSearchQuery(m, threadId ? getThreadSlots(threadId) : {}, 'web_search', logger?.log);
    return RouterResult.parse({ intent:'web_search', needExternal:true, slots:{ search_query:q }, confidence:0.9 });
  }

  // Handle flight clarification responses (no recursion)
  const ctxSlots = threadId ? getThreadSlots(threadId) : {};
  if (ctxSlots.awaiting_flight_clarification === 'true' && threadId) {
    const userResponse = m.toLowerCase();
    const pendingQuery = ctxSlots.pending_flight_query || '';
    
    // Clear the clarification state
    updateThreadSlots(threadId, {}, [
      'awaiting_flight_clarification',
      'pending_flight_query',
      'clarification_reasoning'
    ]);
    
    // Route based on user's choice (no recursion)
    if (userResponse.includes('direct') || userResponse.includes('search') || userResponse.includes('booking')) {
      const flightSlots = await extractSlots(pendingQuery, ctxSlots, logger?.log);
      logger?.log?.debug({ choice: 'direct_search', slots: flightSlots }, 'flight_clarification_resolved');
      return RouterResult.parse({
        intent: 'flights',
        needExternal: true,
        slots: { ...ctxSlots, ...flightSlots },
        confidence: 0.9
      });
    } else if (userResponse.includes('research') || userResponse.includes('planning') || userResponse.includes('advice')) {
      logger?.log?.debug({ choice: 'web_research' }, 'flight_clarification_resolved');
      return RouterResult.parse({
        intent: 'web_search',
        needExternal: true,
        slots: { ...ctxSlots, search_query: pendingQuery },
        confidence: 0.9
      });
    } else {
      // Process current message instead of recursion
      logger?.log?.debug({ choice: 'process_current' }, 'flight_clarification_ambiguous');
    }
  }

  // 1) Flight fast-path (no LLM)
  if (RE.flights.test(m)) {
    const { isDirect } = isDirectFlightHeuristic(m);
    if (isDirect) {
      const slots = await extractSlots(m, ctxSlots, logger?.log);
      logger?.log?.debug({ isDirect:true, slots }, '✈️ FLIGHTS: direct (heuristic)');
      return RouterResult.parse({ intent:'flights', needExternal:true, slots, confidence:0.9 });
    }
  }

  // 2) Deep-research consent? (no LLM)
  if (process.env.DEEP_RESEARCH_ENABLED === 'true') {
    const cx = cheapComplexity(m);
    if (cx.complex) {
      threadId && updateThreadSlots(threadId, {
        awaiting_deep_research_consent:'true',
        pending_deep_research_query:m,
        complexity_reasoning:cx.reason
      }, []);
      logger?.log?.debug({ reason:cx.reason }, 'complexity_consent_gate');
      return RouterResult.parse({
        intent:'system', needExternal:false,
        slots:{ deep_research_consent_needed:'true', complexity_score:'0.80' },
        confidence:0.9
      });
    }
  }

  // 3) Transformers-first (no LLM inside)
  let tfm: RouterResultT | undefined = undefined;
  if (transformersEnabled()) tfm = await routeViaTransformersFirst(m, threadId, logger);
  if (tfm) {
    // Intent-gated slot refine (single pass)
    if (tfm.intent === 'flights') {
      const refined = await extractSlots(m, ctxSlots, logger?.log);
      return RouterResult.parse({ ...tfm, slots: { ...tfm.slots, ...refined } });
    }
    return RouterResult.parse(tfm);
  }

  // 4) Single LLM call (router_llm) → intent + slots at once
  const prompt = (await getPrompt('router_llm')).replace('{message}', m).replace('{instructions}','');
  const raw = await callLLM(prompt, { responseFormat:'json', log:logger?.log });
  const json = JSON.parse(raw);
  const llm = RouterResult.parse(json);

  // 5) Post-LLM slot enhancement for flights
  if (llm.intent === 'flights') {
    try {
      const enhancedSlots = await extractSlots(m, ctxSlots, logger?.log);
      
      // Preserve relative dates from LLM (today, tomorrow, etc.) over enhanced parsing
      const preservedSlots = { ...enhancedSlots };
      if (llm.slots?.dates && /^(today|tomorrow|tonight|now)$/i.test(llm.slots.dates)) {
        preservedSlots.dates = llm.slots.dates;
        preservedSlots.departureDate = llm.slots.dates;
        // Don't override month for relative dates
        delete preservedSlots.month;
      }
      
      // Merge LLM slots with enhanced slots, prioritizing preserved relative dates
      const mergedSlots = { ...enhancedSlots, ...llm.slots, ...preservedSlots };
      
      logger?.log?.debug({ 
        llmSlots: llm.slots, 
        enhancedSlots, 
        preservedSlots,
        mergedSlots 
      }, 'flights_slot_enhancement');
      
      const enhanced = RouterResult.parse({
        ...llm,
        slots: mergedSlots
      });
      
      logger?.log?.debug({ intent: enhanced.intent, confidence: enhanced.confidence }, 'router_final_result');
      return enhanced;
    } catch (error) {
      logger?.log?.debug({ error: String(error) }, 'flights_slot_enhancement_failed');
    }
  }
  
  // 6) Post-LLM heuristics (cheap)
  if (llm.intent === 'flights' && !RE.dateish.test(m)) {
    logger?.log?.debug({ reason:'missing_date' }, 'flights_missing_date');
  }
  
  logger?.log?.debug({ intent: llm.intent, confidence: llm.confidence }, 'router_final_result');
  return llm;
}

// Make classifyIntentFromTransformers LLM-free
async function classifyIntentFromTransformers(
  message: string, 
  intentResult: any,
  entityResult: any,
  slots: any, 
  log?: pino.Logger
): Promise<{ intent: string; needExternal: boolean; confidence: number } | undefined> {
  
  const intent = intentResult.intent;
  let confidence = intentResult.confidence ?? 0.7;
  const hasLoc = !!slots.city || (entityResult.locations?.length > 0);
  const needExternal = (intent === 'weather' || intent === 'destinations') ? true
                     : (intent === 'attractions' ? hasLoc : intent === 'flights');

  // Small regex bumps
  if (intent === 'weather' && RE.weather.test(message)) confidence = Math.max(confidence, 0.85);

  return { intent, needExternal, confidence };
}

async function routeViaTransformersFirst(
  message: string,
  threadId?: string,
  logger?: { log: pino.Logger },
): Promise<RouterResultT | undefined> {
  const log = logger?.log;
  const timeoutMs = Math.max(100, Number(process.env.TRANSFORMERS_ROUTER_TIMEOUT_MS ?? '3000'));
  
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

  if (!result || timedOut) {
    log?.debug({ success: false, reason: timedOut ? 'timeout' : 'low_confidence', durationMs }, 'transformers_skipped');
    return undefined;
  }

  if (result.confidence >= 0.7) {
    log?.debug({ success: true, durationMs, intent: result.intent, confidence: result.confidence }, 'transformers_accepted');
    return RouterResult.parse(result);
  }

  return undefined;
}

async function tryRouteViaTransformers(message: string, threadId?: string, log?: pino.Logger): Promise<RouterResultT | undefined> {
  try {
    // Use enhanced NER for better entity extraction
    const { extractEntitiesEnhanced } = await import('./ner-enhanced.js');
    const entityResult = await extractEntitiesEnhanced(message, log);
    
    // Use transformers-based intent classification
    const { classifyIntent } = await import('./transformers-classifier.js');
    const intentResult = await classifyIntent(message, log);

    // Get thread context for slot merging
    const ctxSlots = threadId ? getThreadSlots(threadId) : {};
    
    // Extract slots using our parsers
    const extractedSlots = await extractSlots(message, ctxSlots, log);
    
    // Enhanced intent classification based on transformers results (NO LLM)
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
    log?.debug({ error: String(error) }, 'transformers_failed');
    return undefined;
  }
}
