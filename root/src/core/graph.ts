import { routeIntent } from './router.js';
import { MONTH_WORDS as __MONTHS_GUARD__ } from './parsers.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { getThreadSlots, updateThreadSlots, setLastIntent, getLastIntent } from './slot_memory.js';
import { searchTravelInfo } from '../tools/brave_search.js';
import { callLLM, classifyContent, optimizeSearchQuery } from './llm.js';
import { getPrompt } from './prompts.js';
import { TransformersNLP } from './transformers-nlp-facade.js';

import { classifyContent as classifyContentTransformers, classifyIntent } from './transformers-classifier.js';
import { detectLanguage } from './transformers-detector.js';
import { extractEntitiesEnhanced } from './ner-enhanced.js';
import type pino from 'pino';
import pinoLib from 'pino';

async function detectConsent(
  message: string,
  ctx: { log: pino.Logger },
): Promise<'yes' | 'no' | 'unclear'> {
  ctx.log.info({ message }, '🔍 CONSENT: Starting AI-first detection');
  
  // Step 1: LLM-first approach (AI-first)
  const promptTemplate = await getPrompt('consent_detector');
  const prompt = promptTemplate.replace('{message}', message);

  try {
    const response = await callLLM(prompt, { log: ctx.log });
    const answer = response.toLowerCase().trim();
    
    ctx.log.info({ response, answer, message }, '🔍 CONSENT: LLM response received');
    
    if (answer.startsWith('yes') || answer.includes('yes')) {
      ctx.log.info({ answer }, '🔍 CONSENT: LLM detected YES');
      return 'yes';
    }
    if (answer.startsWith('no') || answer.includes('no')) {
      ctx.log.info({ answer }, '🔍 CONSENT: LLM detected NO');
      return 'no';
    }
    
    ctx.log.info({ answer }, '🔍 CONSENT: LLM detected UNCLEAR');
  } catch (error) {
    ctx.log.error({ error, message }, '🔍 CONSENT: LLM failed, using minimal hardcode');
  }
  
  // Step 2: Minimal hardcode ONLY for very plain responses
  const msg = message.toLowerCase().trim();
  if (msg === 'yes' || msg === 'y') {
    ctx.log.info({ message }, '🔍 CONSENT: Hardcoded YES (plain)');
    return 'yes';
  }
  if (msg === 'no' || msg === 'n') {
    ctx.log.info({ message }, '🔍 CONSENT: Hardcoded NO (plain)');
    return 'no';
  }
  
  return 'unclear';
}

async function isContextSwitchQuery(
  currentMessage: string,
  pendingQuery: string,
  ctx: { log: pino.Logger }
): Promise<boolean> {
  // Quick heuristic checks first
  const current = currentMessage.toLowerCase().trim();
  const pending = pendingQuery.toLowerCase().trim();
  
  // If messages are very similar, not a context switch
  if (current === pending) return false;
  
  // If current message is a simple consent response, not a context switch
  if (/^(yes|no|y|n|sure|ok|okay|nope)$/i.test(current)) return false;
  
  // If current message contains question words and is different topic, likely context switch
  if (/^(what|where|how|when|which|who|why|can|should|do|is|are)/.test(current)) {
    // Use simple keyword overlap to detect topic similarity
    const currentWords = new Set(current.split(/\s+/).filter(w => w.length > 2));
    const pendingWords = new Set(pending.split(/\s+/).filter(w => w.length > 2));
    
    // Calculate overlap ratio
    const intersection = new Set([...currentWords].filter(w => pendingWords.has(w)));
    const overlapRatio = intersection.size / Math.max(currentWords.size, pendingWords.size);
    
    // If less than 20% overlap, likely different topic
    const isContextSwitch = overlapRatio < 0.2;
    
    ctx.log.info({ 
      currentMessage, 
      pendingQuery, 
      overlapRatio, 
      isContextSwitch 
    }, '🔍 CONTEXT: Semantic similarity check');
    
    return isContextSwitch;
  }
  
  return false;
}

export type NodeCtx = { msg: string; threadId: string; onStatus?: (status: string) => void };
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'policy' | 'unknown' | 'web_search' | 'system'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

export async function runGraphTurn(
  message: string,
  threadId: string,
  ctx: { log: pino.Logger; onStatus?: (status: string) => void },
): Promise<NodeOut> {
  // Use transformers-based content classification directly
  const contentClassification = await classifyContentTransformers(message, ctx.log);
  
  // Check for unrelated topics using transformers classification
  if (contentClassification.content_type === 'unrelated') {
    return {
      done: true,
      reply: 'I focus on travel planning. Is there something about weather, destinations, packing, or attractions I can help with?',
    };
  }

  // Check for system identity questions using transformers intent classification
  // Skip system check for refinement messages
  const intentClassification = await classifyIntent(message, ctx.log);
  if (intentClassification.intent === 'system' && contentClassification.content_type !== 'refinement') {
    return {
      done: true,
      reply: 'I\'m an AI travel assistant. I can help you with weather, destinations, packing, and attractions. What would you like to know?',
    };
  }

  // Use transformers-based language detection instead of regex
  let languageWarning = '';
  const languageResult = await detectLanguage(message, ctx.log);
  
  if (languageResult.has_mixed_languages || languageResult.language !== 'en') {
    languageWarning = 'I work better with English, but I\'ll try to help. ';
  }

  // Use NER for timeframe detection instead of regex
  const entityResult = await extractEntitiesEnhanced(message, ctx.log);
  const shortTimeframe = entityResult.durations.some(d => 
    /\b(\d+)\s*-?\s*(hour|hr|minute|min)\b/i.test(d.text) || 
    /day\s*trip/i.test(message)
  );
  
  let dayTripNote = '';
  if (shortTimeframe) {
    dayTripNote = 'For such a short trip, you\'ll likely need minimal packing. ';
  }

  // Use transformers content classification for budget detection
  let isBudgetQuery = contentClassification.content_type === 'budget';
  let budgetDisclaimer = '';
  
  if (isBudgetQuery) {
    budgetDisclaimer = 'I can\'t help with budget planning or costs, but I can provide travel destination information. ';
  }

  // Handle consent responses for web search
  const threadSlots = getThreadSlots(threadId);
  const awaitingSearchConsent = threadSlots.awaiting_search_consent === 'true';
  const pendingSearchQuery = threadSlots.pending_search_query;
  const awaitingDeepResearch = threadSlots.awaiting_deep_research_consent === 'true';
  const pendingDeepResearchQuery = threadSlots.pending_deep_research_query;
  
  ctx.log.info({ 
    threadSlots,
    awaitingDeepResearch,
    pendingDeepResearchQuery,
    awaitingSearchConsent,
    pendingSearchQuery,
    threadId
  }, '🔍 THREAD: Slots state check');
  
  if (awaitingSearchConsent && pendingSearchQuery) {
    const consent = await detectConsent(message, ctx);
    const isConsentResponse = consent !== 'unclear';
    
    if (isConsentResponse) {
      const isPositiveConsent = consent === 'yes';
      
      // Clear consent state
      updateThreadSlots(threadId, { 
        awaiting_search_consent: '', 
        pending_search_query: '' 
      }, []);
      
      if (isPositiveConsent) {
        // Optimize the pending search query
        const optimizedQuery = await optimizeSearchQuery(
          pendingSearchQuery,
          threadSlots,
          'web_search',
          ctx.log
        );
        
        return await performWebSearchNode(optimizedQuery, ctx, threadId);
      } else {
        return {
          done: true,
          reply: 'No problem! Is there something else about travel planning I can help with?',
        };
      }
    }
  }

  // Handle consent responses for deep research
  if (awaitingDeepResearch && pendingDeepResearchQuery) {
    ctx.log.info({ 
      awaitingDeepResearch, 
      pendingDeepResearchQuery, 
      message,
      threadId 
    }, '🔍 CONSENT: Deep research consent check triggered');
    
    // FIRST: Check if this is a context switch (new query vs consent response)
    // Use semantic similarity to detect if user switched topics
    const isSemanticContextSwitch = await isContextSwitchQuery(message, pendingDeepResearchQuery, ctx);
    
    if (isSemanticContextSwitch) {
      ctx.log.info({ isContextSwitch: true }, '🔍 CONSENT: Context switch detected, clearing state');
      // Clear old consent state and process new query
      updateThreadSlots(threadId, {
        awaiting_deep_research_consent: '',
        pending_deep_research_query: '',
        complexity_reasoning: ''
      }, []);
      // Continue with normal routing for the new query
    } else {
      // Only check consent if it's NOT a context switch
      const consent = await detectConsent(message, ctx);
      const isConsentResponse = consent !== 'unclear';
      
      ctx.log.info({ 
        consent, 
        isConsentResponse, 
        message 
      }, '🔍 CONSENT: Detection result');
      
      if (isConsentResponse) {
        const isPositive = consent === 'yes';
        ctx.log.info({ 
          isPositive, 
          pendingDeepResearchQuery 
        }, '🔍 CONSENT: Processing consent response');
        
        // Clear consent state
        updateThreadSlots(threadId, {
          awaiting_deep_research_consent: '',
          pending_deep_research_query: '',
          complexity_reasoning: ''
        }, []);
        
        if (isPositive) {
          ctx.log.info({ query: pendingDeepResearchQuery }, '🚀 CONSENT: Executing deep research');
          return await performDeepResearchNode(pendingDeepResearchQuery, ctx, threadId);
        } else {
          // Fall back to standard routing with the pending query
          const routeResult = await routeIntentNode({ msg: pendingDeepResearchQuery, threadId }, ctx);
          if ('done' in routeResult) return routeResult;
          return { next: routeResult.next, slots: routeResult.slots };
        }
      }
    }
  }

  // Handle consent responses for web search after empty RAG results
  const awaitingWebSearchConsent = threadSlots.awaiting_web_search_consent === 'true';
  const pendingWebSearchQuery = threadSlots.pending_web_search_query;
  
  if (awaitingWebSearchConsent && pendingWebSearchQuery) {
    const consent = await detectConsent(message, ctx);
    const isConsentResponse = consent !== 'unclear';
    if (isConsentResponse) {
      const isPositive = consent === 'yes';
      // Clear consent state
      updateThreadSlots(threadId, {
        awaiting_web_search_consent: '',
        pending_web_search_query: ''
      }, []);
      if (isPositive) {
        return webSearchNode({ msg: pendingWebSearchQuery, threadId }, {}, ctx);
      } else {
        return {
          done: true,
          reply: 'Understood. Feel free to ask me anything else!'
        };
      }
    }
  }

  // Use Transformers NER to intelligently detect actual cities vs other words
  let actualCities: string[] = [];
  try {
    const { extractEntities } = await import('./transformers-nlp.js');
    const entities = await extractEntities(message);
    actualCities = entities
      .filter((entity: any) => entity.entity_group === 'B-LOC' && entity.score > 0.8)
      .map((entity: any) => entity.text);
  } catch (error) {
    // Fallback to improved regex if Transformers fails
    const destinations = message.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    actualCities = destinations.filter(d => {
      const lower = d.toLowerCase();
      const nonCityWords = [
        'the', 'and', 'but', 'for', 'can', 'will', 'what', 'how', 'to', 'in', 'about',
        'weather', 'weaher', 'pack', 'packing', 'trip', 'travel', 'visit', 'go', 'going',
        'attractions', 'things', 'places', 'where', 'when', 'which', 'should', 'would'
      ];
      return d.length > 2 && !nonCityWords.includes(lower);
    });
  }
  
  const uniqueDestinations = [...new Set(actualCities)];
  
  // Also check thread context for previous cities
  const currentThreadSlots = getThreadSlots(threadId);
  const previousCities = [];
  if (currentThreadSlots.city) previousCities.push(currentThreadSlots.city);
  if (currentThreadSlots.originCity) previousCities.push(currentThreadSlots.originCity);
  
  // Combine current and previous cities, but only if we have real cities
  const allCities = [...new Set([...uniqueDestinations, ...previousCities])];
  
  // Skip destination conflict detection for complex travel planning queries
  const isComplexTravelQuery = /\b(budget|cost|price|\$\d+|adults?|kids?|children|toddler|family|days?|weeks?|flights?|dislikes?|ideas?)\b/i.test(message);
  
  // Only trigger conflict detection if we have multiple actual cities AND it's not a complex travel query
  if (!isComplexTravelQuery && allCities.length > 1 && uniqueDestinations.length > 0 && previousCities.length > 0) {
    return {
      done: true,
      reply: `I see you've mentioned multiple cities: ${allCities.join(', ')}. Which specific destination would you like information about?`,
    };
  }
  
  if (!isComplexTravelQuery && uniqueDestinations.length > 1) {
    return {
      done: true,
      reply: `I see multiple destinations mentioned: ${uniqueDestinations.join(', ')}. Which specific destination would you like information about?`,
    };
  }

  // Check for conflicting seasons/times in the same message
  const seasons = message.match(/\b(winter|summer|spring|fall|autumn)\b/gi) || [];
  const uniqueSeasons = [...new Set(seasons.map(s => s.toLowerCase()))];
  if (uniqueSeasons.length > 1) {
    return {
      done: true,
      reply: `I notice you mentioned multiple seasons (${uniqueSeasons.join(', ')}). Which season are you planning to travel in?`,
    };
  }

  const routeCtx: NodeCtx = { msg: message, threadId, onStatus: ctx.onStatus };
  const routeResult = await routeIntentNode(routeCtx, ctx);
  if ('done' in routeResult) {
    return routeResult;
  }
  // If router requests deep research consent, ask the user
  if (routeResult.slots?.deep_research_consent_needed === 'true') {
    const slots = getThreadSlots(threadId);
    const reasoning = slots.complexity_reasoning || 'Multiple constraints detected.';
    return {
      done: true,
      reply: `This looks like a complex travel planning query that could benefit from deep research across multiple sources. This may take a bit longer. Proceed with deep research?\n\nReason: ${reasoning}`,
    };
  }
  // Handle follow-up responses: if intent is unknown but we have prior context, try to infer intent
  let intent = routeResult.next;
  const prior = getThreadSlots(threadId);
  
  // Filter out placeholder values from extracted slots, but only for city switching
  const extractedSlots = routeResult.slots || {};
  const filteredSlots: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(extractedSlots)) {
    if (typeof value === 'string' && value.trim()) {
      const v = value.toLowerCase();
      const MONTH_WORDS = (__MONTHS_GUARD__ as unknown as string[]) || [];
      const placeholderTokens = ['unknown', 'clean_city_name', 'there', 'normalized_name'];
      const datePlaceholders = ['unknown', 'next week', 'normalized_date_string', 'month_name'];
      if (key === 'city') {
        // Always reject placeholder city values regardless of prior state
        if (placeholderTokens.includes(v)) continue;
        // Reject generic non-proper tokens or obvious non-city words
        const looksProper = /^[A-Z][A-Za-z\- ]+$/.test(value);
        const genericWords = ['city', 'destination', 'place'];
        const containsGeneric = genericWords.some(w => v.includes(w));
        const isTemporal = MONTH_WORDS?.includes?.(v) || /\b(today|now|tomorrow|next|last|week|month|year)\b/.test(v);
        if (!looksProper || containsGeneric || isTemporal) continue;
        filteredSlots[key] = value;
        continue;
      }
      // For other fields: reject obvious placeholders
      if (!datePlaceholders.includes(v)) {
        filteredSlots[key] = value;
      }
    }
  }
  
  // Merge slots with priority: prior context + new filtered slots
  const slots = { ...prior, ...filteredSlots };
  
  // Preserve originCity context if available
  if (prior.originCity && !filteredSlots.originCity) {
    slots.originCity = prior.originCity;
  }
  
  // If intent is unknown but we have prior context, infer intent from last interaction
  const lastIntent = getLastIntent(threadId);
  if (intent === 'unknown') {
    if (lastIntent && lastIntent !== 'unknown' && Object.keys(prior).length > 0) {
      intent = lastIntent;
      if (ctx.log && typeof ctx.log.debug === 'function') {
        ctx.log.debug({ originalIntent: 'unknown', inferredIntent: intent, prior, newSlots: routeResult.slots }, 'intent_inference');
      }
    }
  }
  // Treat short refinement messages as continuations of the previous intent
  // But DO NOT override if the user explicitly asks about attractions/what to do
  // or clearly introduces a new city (e.g., "Let's say Boston", "in Boston").
  const mentionsKidContext = /\b(kids?|children|family|make it kid|kid-friendly|kid friendly|toddler|3\s*-?\s*year|stroller)\b/i.test(message);
  const explicitlyAsksAttractions = /\b(attractions?|what to do|what should we do|do in|museum|activities)\b/i.test(message);
  const introducesNewCity = /\b(let'?s\s+say|in|to)\s+[A-Z][A-Za-z\- ]+/.test(message);
  if (mentionsKidContext && lastIntent && lastIntent !== 'unknown' && !explicitlyAsksAttractions && !introducesNewCity) {
    if (ctx.log && typeof ctx.log.debug === 'function') {
      ctx.log.debug({ priorIntent: intent, continuing: lastIntent }, 'refinement_intent_override');
    }
    intent = lastIntent;
  }
  // Also treat flight-time refinements as continuation of destinations planning, not a switch to flights search
  if (/\b(flight time|shorten flight|shorter flight|reduce travel time|quicker flight|shorten travel time|less layover|fewer stops)\b/i.test(message)
      && lastIntent && lastIntent !== 'unknown') {
    if (ctx.log && typeof ctx.log.debug === 'function') {
      ctx.log.debug({ priorIntent: intent, continuing: lastIntent }, 'flight_time_refinement_override');
    }
    intent = lastIntent;
  }
  
  setLastIntent(threadId, intent);
  if (ctx.log && typeof ctx.log.debug === 'function') {
    ctx.log.debug({ prior, extracted: routeResult.slots, merged: slots, intent }, 'slot_merge');
  }
  
  const needsCity = intent === 'attractions' || intent === 'packing' || intent === 'destinations' || intent === 'weather';
  // For destinations, originCity can satisfy city ("from NYC"). For attractions/weather we require explicit city.
  const hasCity = intent === 'destinations'
    ? ((typeof slots.city === 'string' && slots.city.trim().length > 0) || (typeof slots.originCity === 'string' && slots.originCity.trim().length > 0))
    : (typeof slots.city === 'string' && slots.city.trim().length > 0);
  const hasWhen = (typeof slots.dates === 'string' && slots.dates.trim().length > 0)
    || (typeof slots.month === 'string' && slots.month.trim().length > 0);
  
  // Check if message has immediate time context that doesn't require date clarification
  const hasImmediateContext = /\b(today|now|currently|right now|what to wear)\b/i.test(message);
  const hasSpecialContext = /\b(kids?|children|family|business|work|summer|winter|spring|fall)\b/i.test(message);
  
  const missing: string[] = [];
  if (needsCity && !hasCity) missing.push('city');
  if (intent === 'destinations' && !hasWhen) missing.push('dates');
  if (intent === 'packing' && !hasWhen && !hasImmediateContext && !hasSpecialContext) missing.push('dates');
  // Weather queries do NOT require dates - they can provide current weather
  
  // Check for flight queries in destinations intent that should trigger web search instead of asking for dates
  if (intent === 'destinations' && missing.includes('dates')) {
    let isFlightQuery = false;
    
    try {
      const contentClassification = await classifyContent(message, ctx.log);
      isFlightQuery = contentClassification?.content_type === 'flight';
    } catch {
      // Fallback to regex patterns
      const flightPatterns = [
        /airline|flight|fly|plane|ticket|booking/i,
        /what\s+airlines/i,
        /which\s+airlines/i
      ];
      isFlightQuery = flightPatterns.some(pattern => pattern.test(message));
    }
    
    if (isFlightQuery) {
      // Store the pending search query and set consent state
      updateThreadSlots(threadId, {
        awaiting_search_consent: 'true',
        pending_search_query: message
      }, []);
      
      return {
        done: true,
        reply: 'I can search the web to find current flight and airline information. Would you like me to do that?',
      };
    }
  }
  
  if (ctx.log && typeof ctx.log.debug === 'function') {
    ctx.log.debug({ 
      needsCity, hasCity, hasWhen, missing, 
      cityValue: slots.city, 
      datesValue: slots.dates, 
      monthValue: slots.month 
    }, 'missing_check');
  }
  
  if (missing.length > 0) {
    // Special handling for short timeframes - don't ask for dates if it's clearly a day trip
    if (missing.includes('dates') && shortTimeframe) {
      // Remove dates from missing since it's a short trip
      const filteredMissing = missing.filter(m => m !== 'dates');
      if (filteredMissing.length === 0) {
        // No other missing info, proceed without dates
        updateThreadSlots(threadId, slots as Record<string, string>, []);
      } else {
        updateThreadSlots(threadId, slots as Record<string, string>, filteredMissing);
        const q = await buildClarifyingQuestion(filteredMissing, slots as Record<string, string>, ctx.log);
        return { done: true, reply: dayTripNote + q };
      }
    } else {
      updateThreadSlots(threadId, slots as Record<string, string>, missing);
      const q = await buildClarifyingQuestion(missing, slots as Record<string, string>, ctx.log);
      if (ctx.log && typeof ctx.log.debug === 'function') {
        ctx.log.debug({ missing, q }, 'clarifier');
      }
      return { done: true, reply: q };
    }
  }
  // Persist merged slots once complete
  updateThreadSlots(threadId, slots as Record<string, string>, []);

  // Use merged slots for downstream nodes
  const mergedSlots = slots as Record<string, string>;

  // Combine all disclaimers
  const allDisclaimers = languageWarning + dayTripNote + budgetDisclaimer;

  switch (intent) {
    case 'destinations':
      return destinationsNode(routeCtx, mergedSlots, ctx, allDisclaimers);
    case 'weather':
      return weatherNode(routeCtx, mergedSlots, ctx, allDisclaimers);
    case 'packing':
      return packingNode(routeCtx, mergedSlots, ctx, allDisclaimers);
    case 'attractions':
      return attractionsNode(routeCtx, mergedSlots, ctx, allDisclaimers);
    case 'policy':
      return policyNode(routeCtx, mergedSlots, ctx);
    case 'system':
      return await systemNode(routeCtx);
    case 'web_search':
      return webSearchNode(routeCtx, mergedSlots, ctx);
    case 'unknown':
      return unknownNode(routeCtx, ctx);
    default:
      return unknownNode(routeCtx, ctx);
  }
}

async function routeIntentNode(ctx: NodeCtx, logger?: { log: pino.Logger }): Promise<NodeOut> {
  const r = await routeIntent({ message: ctx.msg, threadId: ctx.threadId, logger });
  return { next: r.intent, slots: r.slots };
}

async function weatherNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  // Use thread slots to ensure we have the latest context
  const threadSlots = getThreadSlots(ctx.threadId);
  const mergedSlots = { ...threadSlots, ...(slots || {}) };
  
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'weather',
        needExternal: false,
        slots: mergedSlots,
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }), onStatus: ctx.onStatus },
  );
  const finalReply = disclaimer ? disclaimer + reply : reply;
  return { done: true, reply: finalReply, citations };
}

async function destinationsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  // Use thread slots to ensure we have the latest context
  const threadSlots = getThreadSlots(ctx.threadId);
  const mergedSlots = { ...threadSlots, ...(slots || {}) };

  // Directly call AI-enhanced destinations tool instead of blendWithFacts
  const { recommendDestinations } = await import('../tools/destinations.js');
  
  try {
    const destinations = await recommendDestinations(mergedSlots, logger?.log);
    
    if (destinations.length > 0) {
      const destinationList = destinations.map(d => 
        `${d.value.city}, ${d.value.country} (${d.value.tags.climate} climate, ${d.value.tags.budget} budget${d.value.tags.family_friendly ? ', family-friendly' : ''})`
      ).join('; ');
      
      const baseReply = `Based on your preferences, here are some recommended destinations:\n\n${destinationList}`;
      const finalReply = disclaimer ? disclaimer + baseReply : baseReply;
      const citations = ['AI-Enhanced Catalog', 'REST Countries API'];
      
      return { done: true, reply: finalReply, citations };
    } else {
      // Fallback to web search if no destinations found
      return webSearchNode(ctx, { ...mergedSlots, search_query: `travel destinations ${mergedSlots.month || ''} ${mergedSlots.travelerProfile || ''}`.trim() }, logger);
    }
  } catch (error) {
    if (logger?.log?.warn) {
      logger.log.warn({ error: String(error) }, 'destinations_tool_failed');
    }
    // Fallback to web search on error
    return webSearchNode(ctx, { ...mergedSlots, search_query: `travel destinations ${mergedSlots.month || ''} ${mergedSlots.travelerProfile || ''}`.trim() }, logger);
  }
}

async function packingNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  // Use thread slots to ensure we have the latest context
  const threadSlots = getThreadSlots(ctx.threadId);
  const mergedSlots = { ...threadSlots, ...(slots || {}) };
  
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'packing',
        needExternal: false,
        slots: mergedSlots,
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }), onStatus: ctx.onStatus },
  );
  const finalReply = disclaimer ? disclaimer + reply : reply;
  return { done: true, reply: finalReply, citations };
}

async function attractionsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  // Use thread slots to ensure we have the latest context
  const threadSlots = getThreadSlots(ctx.threadId);
  const mergedSlots = { ...threadSlots, ...(slots || {}) };

  // Directly call attractions tool instead of blendWithFacts
  const { getAttractions } = await import('../tools/attractions.js');
  
  const city = mergedSlots.city;
  if (!city) {
    return { done: true, reply: 'I need to know which city you\'re asking about to find attractions.' };
  }

  // Detect kid-friendly profile from message context
  const isKidFriendly = /\b(kids?|children|family|kid-friendly|kid friendly|toddler|stroller)\b/i.test(ctx.msg);
  const profile = isKidFriendly ? 'kid_friendly' : 'default';

  try {
    const result = await getAttractions({ 
      city, 
      limit: 7, 
      profile 
    });

    if (result.ok) {
      const sourceName = result.source === 'opentripmap' ? 'OpenTripMap' : 'Brave Search';
      const baseReply = `Here are some attractions in ${city}:\n\n${result.summary}\n\nSource: ${sourceName}`;
      const finalReply = disclaimer ? disclaimer + baseReply : baseReply;
      const citations = result.source ? [sourceName] : [];
      return { done: true, reply: finalReply, citations };
    } else {
      // Fallback to web search if attractions tool fails
      return webSearchNode(ctx, { ...mergedSlots, search_query: `${city} attractions things to do` }, logger);
    }
  } catch (error) {
    if (logger?.log?.warn) {
      logger.log.warn({ error: String(error), city }, 'attractions_tool_failed');
    }
    // Fallback to web search on error
    return webSearchNode(ctx, { ...mergedSlots, search_query: `${city} attractions things to do` }, logger);
  }
}

async function policyNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger }
): Promise<NodeOut> {
  const { PolicyAgent } = await import('./policy_agent.js');
  const agent = new PolicyAgent();
  
  try {
    const { answer, citations } = await agent.answer(
      ctx.msg, 
      undefined, 
      ctx.threadId, 
      logger?.log
    );
    
    // Check if no results found in internal knowledge base
    if (!citations.length || citations.every(c => !c.snippet?.trim())) {
      // Set consent state for web search
      updateThreadSlots(ctx.threadId, {
        awaiting_web_search_consent: 'true',
        pending_web_search_query: ctx.msg
      }, []);
      
      const noDataMessage = `I couldn't find information about this in our internal knowledge base. 

Would you like me to search the web for current information? This will take a bit longer but may provide more comprehensive results.

Type 'yes' to proceed with web search, or ask me something else.`;
      
      // Store empty receipts for no results case
      try {
        const { setLastReceipts } = await import('./slot_memory.js');
        const facts = [{ source: 'Vectara', key: 'no_results', value: 'Internal Knowledge Base (No Results)' }];
        const decisions = [`Policy query attempted: "${ctx.msg}"`];
        setLastReceipts(ctx.threadId, facts, decisions, noDataMessage);
      } catch {
        // ignore receipt storage errors
      }
      
      return { 
        done: true, 
        reply: noDataMessage, 
        citations: ['Internal Knowledge Base (No Results)']
      };
    }
    
    // Store policy receipts
    try {
      const { setLastReceipts } = await import('./slot_memory.js');
      const facts = citations.slice(0, 5).map((citation, index) => ({
        source: 'Vectara',
        key: `policy_${index}`,
        value: citation.url || citation.title || 'Internal Knowledge Base',
        url: citation.url
      }));
      const decisions = [`RAG answer from Vectara corpus for policy query: "${ctx.msg.replace(/&quot;/g, '"')}"`];
      setLastReceipts(ctx.threadId, facts, decisions, answer);
      
      if (logger?.log?.debug) {
        logger.log.debug({ 
          citationsCount: citations.length, 
          factsStored: facts.length 
        }, 'policy_receipts_persisted');
      }
    } catch {
      // ignore receipt storage errors
    }
    
    const formattedAnswer = formatPolicyAnswer(answer, citations);
    const citationTitles = citations.map(c => c.title || c.url || 'Internal Knowledge Base');
    
    return { 
      done: true, 
      reply: formattedAnswer, 
      citations: citationTitles 
    };
  } catch (error) {
    if (logger?.log?.warn) {
      logger.log.warn({ error: String(error) }, '❌ PolicyAgent failed, falling back');
    }
    
    // Fallback to web search
    return webSearchNode(ctx, slots, logger);
  }
}

function formatPolicyAnswer(
  answer: string, 
  citations: Array<{ url?: string; title?: string }>
): string {
  if (!citations.length) return answer;
  
  const sources = citations
    .map((c, i) => `${i + 1}. ${c.title ?? 'Internal Knowledge Base'}${c.url ? ` — ${c.url}` : ''}`)
    .join('\n');
  
  return `${answer}\n\nSources:\n${sources}`;
}

async function systemNode(ctx: NodeCtx): Promise<NodeOut> {
  return {
    done: true,
    reply: 'Which city and what dates are you planning to travel to?',
    citations: undefined,
  };
}

async function webSearchNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const searchQuery = slots?.search_query || ctx.msg;
  
  // Optimize the search query if not already optimized
  const optimizedQuery = slots?.search_query 
    ? searchQuery // Already optimized in router
    : await optimizeSearchQuery(searchQuery, slots || {}, 'web_search', logger?.log);
  
  return await performWebSearchNode(optimizedQuery, logger || { log: pinoLib({ level: 'silent' }) }, ctx.threadId);
}

async function performWebSearchNode(
  query: string,
  ctx: { log: pino.Logger },
  threadId: string,
): Promise<NodeOut> {
  ctx.log.debug({ query }, 'performing_web_search_node');
  
  const searchResult = await searchTravelInfo(query, ctx.log);
  
  if (!searchResult.ok) {
    ctx.log.debug({ reason: searchResult.reason }, 'web_search_failed');
    return {
      done: true,
      reply: 'I\'m unable to search the web right now. Could you ask me something about weather, destinations, packing, or attractions instead?',
    };
  }
  
  if (searchResult.results.length === 0) {
    return {
      done: true,
      reply: 'I couldn\'t find relevant information for your search. Could you try rephrasing your question or ask me about weather, destinations, packing, or attractions?',
    };
  }
  
  // Use summarization for better results
  const { reply, citations } = await summarizeSearchResults(searchResult.results, query, ctx);
  
  // Store search receipts
  if (threadId) {
    try {
      const { setLastReceipts } = await import('./slot_memory.js');
      const facts = searchResult.results.slice(0, 3).map((result, index) => ({
        source: 'Brave Search',
        key: `search_result_${index}`,
        value: `${result.title}: ${result.description.slice(0, 100)}...`
      }));
      const decisions = [`Performed web search for: "${query}"`];
      setLastReceipts(threadId, facts, decisions, reply);
    } catch {
      // ignore receipt storage errors
    }
  }
  
  return {
    done: true,
    reply,
    citations,
  };
}

async function performDeepResearchNode(
  query: string,
  ctx: { log: pino.Logger },
  threadId: string,
): Promise<NodeOut> {
  try {
    // Optimize the query for better search results
    const { optimizeSearchQuery } = await import('./llm.js');
    const optimizedQuery = await optimizeSearchQuery(query, {}, 'destinations', ctx.log);
    
    const { performDeepResearch } = await import('./deep_research.js');
    const research = await performDeepResearch(optimizedQuery, { threadId }, ctx.log);
    // Store receipts
    try {
      const { setLastReceipts } = await import('./slot_memory.js');
      const facts = research.citations.map((c, i) => ({ source: c.source, key: `deep_${i}`, value: c.url }));
      const decisions = [`Deep research performed for: "${query}"`];
      setLastReceipts(threadId, facts, decisions, research.summary);
    } catch {}
    return { done: true, reply: research.summary, citations: research.sources };
  } catch (error) {
    ctx.log.error({ error: error instanceof Error ? error.message : String(error) }, 'deep_research_failed');
    return { done: true, reply: 'I ran into an issue while doing deep research. I can try a standard search instead if you like.' };
  }
}

async function summarizeSearchResults(
  results: Array<{ title: string; url: string; description: string }>,
  query: string,
  ctx: { log: pino.Logger },
): Promise<{ reply: string; citations: string[] }> {
  // Feature flag check
  if (process.env.SEARCH_SUMMARY === 'off') {
    return formatSearchResultsFallback(results);
  }

  try {
    const promptTemplate = await getPrompt('search_summarize');
    const topResults = results.slice(0, 7);

    // Debug: Log search results for analysis
    ctx.log.debug({
      searchResultsCount: results.length,
      topResultsTitles: results.slice(0, 3).map(r => r.title),
      query: query
    }, 'search_results_for_summarization');

    // Format results for LLM
    const formattedResults = topResults.map((result, index) => ({
      id: index + 1,
      title: result.title.replace(/<[^>]*>/g, ''), // Strip HTML
      url: result.url,
      description: result.description.replace(/<[^>]*>/g, '').slice(0, 200)
    }));
    
    const prompt = promptTemplate
      .replace('{query}', query)
      .replace('{results}', JSON.stringify(formattedResults, null, 2));
    
    const response = await callLLM(prompt, { log: ctx.log });
    
    // Sanitize and validate response
    let sanitized = response
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    
    // Ensure no CoT leakage
    sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
    
    // Truncate if too long (increased for 3-paragraph summaries)
    if (sanitized.length > 2000) {
      const sentences = sanitized.split(/[.!?]+/);
      let truncated = '';
      for (const sentence of sentences) {
        if ((truncated + sentence).length > 1900) break;
        truncated += sentence + '.';
      }
      sanitized = truncated;
    }
    
    // Ensure Sources block with direct links present; if missing, append from our results
    const hasLinks = /https?:\/\//i.test(sanitized) || /Sources:/i.test(sanitized);
    let finalText = sanitized;
    if (!hasLinks) {
      const sourcesBlock = ['Sources:', ...formattedResults.slice(0, 5).map(r => `${r.id}. ${r.title} - ${r.url}`)].join('\n');
      finalText = `${sanitized}\n\n${sourcesBlock}`;
    }
    return {
      reply: finalText,
      citations: ['Brave Search']
    };
  } catch (error) {
    ctx.log.debug('Search summarization failed, using fallback');
    return formatSearchResultsFallback(results);
  }
}

function formatSearchResultsFallback(
  results: Array<{ title: string; url: string; description: string }>
): { reply: string; citations: string[] } {
  const topResults = results.slice(0, 3);
  const formattedResults = topResults.map(result => {
    const cleanTitle = result.title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const cleanDesc = result.description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const truncatedDesc = cleanDesc.slice(0, 100) + (cleanDesc.length > 100 ? '...' : '');
    return `• ${cleanTitle} - ${truncatedDesc}`;
  }).join('\n');
  
  return {
    reply: `Based on web search results:\n\n${formattedResults}\n\nSources: Brave Search`,
    citations: ['Brave Search']
  };
}

async function unknownNode(ctx: NodeCtx, logger?: { log: pino.Logger }): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'unknown',
        needExternal: false,
        slots: {},
        confidence: 0.3,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }), onStatus: ctx.onStatus },
  );
  return { done: true, reply, citations };
}
