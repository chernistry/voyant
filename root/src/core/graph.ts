/**
 * Optimized Graph Implementation - G-E-R-A Pattern
 * Guard → Extract → Route → Act
 * 
 * Key optimizations:
 * - Single-pass extraction (no duplicate NER/CLS/LLM calls)
 * - Fast-path routing for common cases
 * - Unified consent handling
 * - Decision table for routing logic
 */

import type pino from 'pino';
import pinoLib from 'pino';
import { routeIntent } from './router.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { 
  getThreadSlots, 
  updateThreadSlots, 
  setLastIntent, 
  getLastIntent,
  normalizeSlots,
  readConsentState,
  writeConsentState
} from './slot_memory.js';
import { callLLM, callLLMBatch, optimizeSearchQuery } from './llm.js';
import { getPrompt } from './prompts.js';
import { classifyContent as classifyContentTransformers } from './transformers-classifier.js';
import { detectLanguage } from './transformers-detector.js';
import { extractEntitiesEnhanced } from './ner-enhanced.js';
import { searchTravelInfo, getSearchCitation } from '../tools/search.js';
import type { SearchResult } from '../tools/search.js';
import {
  buildConstraintGraph,
  getCombinationKey,
  ConstraintType,
} from './constraintGraph.js';

// Types
export type NodeCtx = { msg: string; threadId: string; onStatus?: (status: string) => void };
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'policy' | 'flights' | 'irrops' | 'unknown' | 'web_search' | 'system'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

type ScoredSpan = { text: string; score: number };
type Entities = {
  locations: ScoredSpan[];
  dates: ScoredSpan[];
  durations: ScoredSpan[];
  money: ScoredSpan[];
};

// Helper functions
function sanitizeSlotsView(all: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(all).filter(([k]) =>
      !k.startsWith('awaiting_') &&
      !k.startsWith('pending_') &&
      k !== 'complexity_reasoning'
    )
  );
}

function sanitizeSearchQuery(input: string): string {
  const stripped = input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(?:system:|assistant:|user:)\s*/gi, '')
    .replace(/[<>]/g, '')
    .trim();
  return stripped.slice(0, 512);
}

/**
 * Main graph execution with G-E-R-A pattern
 * Reduces complexity and LLM calls through:
 * - Guard stage: Fast micro-rules
 * - Extract stage: Single-pass cached extraction  
 * - Route stage: Decision table
 * - Act stage: Domain nodes
 */
export async function runGraphTurn(
  message: string,
  threadId: string,
  ctx: { log: pino.Logger; onStatus?: (status: string) => void },
): Promise<NodeOut> {
  let llmCallsThisTurn = 0;
  
  // === GUARD STAGE: Fast micro-rules first ===
  const { 
    checkYesNoShortcut, 
    checkPolicyHit, 
    checkWebishHit,
    buildTurnCache 
  } = await import('./graph.optimizers.js');
  
  // Build turn cache for single-pass extraction
  const C = await buildTurnCache(message, ctx.log);
  
  // Check for YES/NO shortcuts if any consent flags are set
  const earlySlots = getThreadSlots(threadId);
  const consentState = readConsentState(earlySlots);
  
  if (consentState.awaiting) {
    const yesNo = checkYesNoShortcut(message);
    if (yesNo) {
      ctx.log.debug({ yesNo, fastpath: 'consent' }, 'guard_yes_no_hit');
      writeConsentState(threadId, { type: '', pending: '' }); // Clear
      
      if (yesNo === 'yes' && consentState.pending) {
        if (consentState.type === 'deep') {
          return await performDeepResearchNode(consentState.pending, ctx, threadId);
        } else {
          return await performWebSearchNode(consentState.pending, ctx, threadId);
        }
      } else {
        return { done: true, reply: 'No problem! Is there something else about travel planning I can help with?' };
      }
    }
  }
  
  // Policy hit → force intent and clear consent state
  if (checkPolicyHit(message)) {
    C.forced = 'policy';
    // Clear any pending consent state since this is a new, unrelated query
    writeConsentState(threadId, { type: '', pending: '' });
    ctx.log.debug({ fastpath: 'policy' }, 'guard_policy_hit');
  }
  
  // Web-ish hit → set consent and return
  if (checkWebishHit(message)) {
    writeConsentState(threadId, { type: 'web', pending: message });
    ctx.log.debug({ fastpath: 'webish' }, 'guard_webish_hit');
    return { done: true, reply: 'I can look this up on the web. Want me to search now?' };
  }
  
  // Weather fast-path guard - before any LLM calls
  if (/\bweather\b/i.test(message) && /\btoday\b/i.test(message)) {
    const { extractCityLite } = await import('./graph.optimizers.js');
    const city = await extractCityLite(message, ctx.log);
    if (city) {
      ctx.log.debug({ city, fastpath: 'weather_guard' }, 'guard_weather_hit');
      return await weatherNode(
        { msg: message, threadId, onStatus: ctx.onStatus },
        { city },
        ctx
      );
    }
  }
  
  // === EXTRACT STAGE: Router-once with intent-gated extractors ===
  // Single router call with slots. If guard forced an intent, skip LLM router.
  if (!C.route) {
    if (C.forced) {
      C.route = { intent: C.forced, slots: {}, confidence: 0.9 } as any;
      ctx.log.debug({ route: C.route }, 'router_skipped_forced_intent');
    } else {
      const routed = await routeIntent({
        message,
        threadId: threadId, 
        logger: { log: ctx.log }
      });
      C.route = { 
        intent: routed.intent, 
        slots: routed.slots || {}, 
        confidence: routed.confidence 
      };
      llmCallsThisTurn++;
      ctx.log.debug({ route: C.route }, 'router_once');
    }
  }
  
  // Intent-gated extractors
  const routedIntent = C.forced ?? C.route?.intent;
  const promises = [];
  
  // Only run NER for flights intent
  if (routedIntent === 'flights' && !C.ner) {
    promises.push((async () => {
      C.ner = await extractEntitiesEnhanced(message, ctx.log) as Entities;
      llmCallsThisTurn++;
    })());
  }
  
  // Lightweight city extraction for weather/attractions/packing/destinations
  if (routedIntent && ['weather', 'attractions', 'packing', 'destinations'].includes(routedIntent) && !C.route?.slots.city) {
    promises.push((async () => {
      const { extractCityLite } = await import('./graph.optimizers.js');
      const city = await extractCityLite(message, ctx.log);
      if (city && C.route) C.route.slots.city = city;
    })());
  }
  
  // Content classification only for non-weather intents
  if (routedIntent !== 'weather' && !C.clsContent) {
    promises.push((async () => {
      const { transformersEnabled } = await import('../config/transformers.js');
      if (!transformersEnabled()) {
        C.clsContent = { content_type: 'travel', confidence: 0.5 };
        return;
      }
      const result = await classifyContentTransformers(message, ctx.log);
      C.clsContent = { 
        content_type: result.content_type || 'travel', 
        confidence: result.confidence || 0.5 
      };
      llmCallsThisTurn++;
    })());
  }
  
  await Promise.all(promises);
  
  // === FAST PATH: Weather with high confidence ===
  const { maybeFastWeather } = await import('./graph.optimizers.js');
  const fastWeather = await maybeFastWeather({
    C, 
    slots: getThreadSlots(threadId), 
    threadId, 
    log: ctx.log
  });
  
  if (fastWeather && 'next' in fastWeather) {
    ctx.log.debug({ fastpath: 'weather', llmCallsThisTurn }, 'fastpath_hit');
    updateThreadSlots(threadId, fastWeather.slots || {}, []);
    return await weatherNode(
      { msg: message, threadId, onStatus: ctx.onStatus },
      fastWeather.slots || {},
      ctx
    );
  }
  
  // === UNIFIED CONSENT HANDLING ===
  // Skip consent handling if this is handled by guards (policy, system, etc.)
  const isGuardHandled = C.forced === 'policy' || 
                        (C.route?.intent === 'system' && C.route?.confidence === 0.9) ||
                        (C.route?.intent === 'web_search' && C.route?.confidence === 0.9);
                        
  if (!isGuardHandled) {
    const currentSlots = getThreadSlots(threadId);
    const currentConsentState = readConsentState(currentSlots);
    
    if (currentConsentState.awaiting && currentConsentState.pending) {
      const consent = await detectConsent(message, ctx);
      llmCallsThisTurn++;
      
      if (consent !== 'unclear') {
        writeConsentState(threadId, { type: '', pending: '' }); // Clear
        
        if (consent === 'yes') {
          if (currentConsentState.type === 'deep') {
            return await performDeepResearchNode(currentConsentState.pending, ctx, threadId);
          } else {
            return await performWebSearchNode(currentConsentState.pending, ctx, threadId);
          }
        } else {
          return { done: true, reply: 'No problem! Is there something else about travel planning I can help with?' };
        }
      }
    }
  }
  
  // === ROUTE STAGE: Use cached router result ===
  // Check for unrelated content
  if (C.clsContent?.content_type === 'unrelated') {
    return {
      done: true,
      reply: 'I focus on travel planning. Is there something about weather, destinations, packing, or attractions I can help with?',
    };
  }
  
  // Use cached router result instead of calling routeIntentNode
  let intent = C.forced ?? C.route?.intent;
  
  // === SLOT PROCESSING ===
  const prior = getThreadSlots(threadId);
  const extractedSlots = C.route?.slots || {};
  const slots = normalizeSlots(prior, extractedSlots, intent);
  
  // Check for missing required slots
  const missing = intent ? checkMissingSlots(intent, slots, message) : [];
  if (missing.length > 0) {
    updateThreadSlots(threadId, slots, missing);
    const q = await buildClarifyingQuestion(missing, slots, ctx.log);
    return { done: true, reply: q };
  }
  
  // Update slots and set intent
  updateThreadSlots(threadId, slots, []);
  setLastIntent(threadId, intent as any);
  
  // Log metrics
  ctx.log.debug({ 
    intent, 
    llmCallsThisTurn, 
    slotsCount: Object.keys(slots).length 
  }, 'graph_turn_complete');
  
  // === ACT STAGE: Route to domain nodes ===
  const routeCtx: NodeCtx = { msg: message, threadId, onStatus: ctx.onStatus };
  return intent ? await routeToDomainNode(intent, routeCtx, slots, ctx) : { done: true, reply: "Unable to determine intent", citations: [] };
}

// === HELPER FUNCTIONS ===

async function detectConsent(
  message: string,
  ctx: { log: pino.Logger }
): Promise<'yes' | 'no' | 'unclear'> {
  // Stage 1: Micro rules for obvious responses
  const msg = message.toLowerCase().trim();
  if (/^(yes|y|sure|ok|okay|go ahead|proceed)$/i.test(msg)) {
    ctx.log.debug({ method: 'micro_rules' }, 'consent_yes');
    return 'yes';
  }
  if (/^(no|n|nope|skip|pass|cancel)$/i.test(msg)) {
    ctx.log.debug({ method: 'micro_rules' }, 'consent_no');
    return 'no';
  }

  // Stage 2: LLM fallback
  try {
    const promptTemplate = await getPrompt('consent_detector');
    const prompt = promptTemplate.replace('{message}', message);
    const response = await callLLM(prompt, { log: ctx.log });
    const answer = response.toLowerCase().trim();
    
    if (answer.includes('yes')) return 'yes';
    if (answer.includes('no')) return 'no';
  } catch (error) {
    ctx.log.debug({ error: String(error) }, 'consent_detection_failed');
  }
  
  return 'unclear';
}

function checkMissingSlots(intent: string, slots: Record<string, string>, message: string): string[] {
  const missing: string[] = [];
  
  const needsCity = ['attractions', 'packing', 'destinations', 'weather', 'flights'].includes(intent);
  const hasCity = intent === 'destinations'
    ? !!(slots.city?.trim() || slots.originCity?.trim())
    : !!slots.city?.trim();
  
  const hasWhen = !!(slots.dates?.trim() || slots.month?.trim());
  const hasImmediateContext = /\b(today|now|currently|right now)\b/i.test(message);
  const hasSpecialContext = /\b(kids?|children|family|business|work|summer|winter|spring|fall)\b/i.test(message);
  
  if (needsCity && !hasCity) missing.push('city');
  if (intent === 'destinations' && !hasWhen) missing.push('dates');
  if (intent === 'packing' && !hasWhen && !hasImmediateContext && !hasSpecialContext) missing.push('dates');
  
  return missing;
}

async function routeIntentNode(ctx: NodeCtx, logger?: { log: pino.Logger }): Promise<NodeOut> {
  const r = await routeIntent({ message: ctx.msg, threadId: ctx.threadId, logger });
  return { next: r.intent, slots: r.slots };
}

async function routeToDomainNode(
  intent: string,
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const mergedSlots = slots;
  
  switch (intent) {
    case 'destinations':
      return destinationsNode(ctx, mergedSlots, logger);
    case 'weather':
      return weatherNode(ctx, mergedSlots, logger);
    case 'packing':
      return packingNode(ctx, mergedSlots, logger);
    case 'attractions':
      return attractionsNode(ctx, mergedSlots, logger);
    case 'flights':
      return flightsNode(ctx, mergedSlots, logger);
    case 'irrops':
      return irropsNode(ctx, mergedSlots, logger);
    case 'policy':
      return policyNode(ctx, mergedSlots, logger);
    case 'system':
      return systemNode(ctx);
    case 'web_search':
      return webSearchNode(ctx, mergedSlots, logger);
    case 'unknown':
    default:
      return unknownNode(ctx, logger);
  }
}

// === DOMAIN NODES ===

async function weatherNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };
  
  const city = mergedSlots.city;
  if (!city) {
    return { done: true, reply: 'Which city would you like weather information for?' };
  }
  
  try {
    const { getWeather } = await import('../tools/weather.js');
    const result = await getWeather({ city });
    
    if (result.ok) {
      return { done: true, reply: result.summary, citations: [result.source || 'Weather API'] };
    } else {
      return { done: true, reply: `Sorry, I couldn't get weather information for ${city}. ${result.reason}` };
    }
  } catch (error) {
    logger.log?.warn({ error: String(error), city }, 'weather_fetch_failed');
    return { done: true, reply: `Sorry, I couldn't get weather information for ${city}. Please try another city.` };
  }
}

async function destinationsNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };

  // Try AI-enhanced destinations tool first
  try {
    const { recommendDestinations } = await import('../tools/destinations.js');
    const destinations = await recommendDestinations(mergedSlots, logger.log);
    
    if (destinations.length > 0) {
      const destinationList = destinations.map(d => 
        `${d.value.city}, ${d.value.country} (${d.value.tags.climate} climate, ${d.value.tags.budget} budget${d.value.tags.family_friendly ? ', family-friendly' : ''})`
      ).join('; ');
      
      const reply = `Based on your preferences, here are some recommended destinations:\n\n${destinationList}`;
      const citations = ['AI-Enhanced Catalog', 'REST Countries API'];
      
      return { done: true, reply, citations };
    }
  } catch (error) {
    logger.log?.warn({ error: String(error) }, 'destinations_tool_failed');
  }
  
  // Fallback to web search
  return webSearchNode(ctx, { ...mergedSlots, search_query: `travel destinations ${mergedSlots.month || ''} ${mergedSlots.travelerProfile || ''}`.trim() }, logger);
}

async function packingNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };
  
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
  return { done: true, reply, citations };
}

async function attractionsNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };

  const city = mergedSlots.city;
  if (!city) {
    return { done: true, reply: 'I need to know which city you\'re asking about to find attractions.' };
  }

  // Try attractions tool first
  try {
    const { getAttractions } = await import('../tools/attractions.js');
    const isKidFriendly = /\b(kids?|children|family|kid-friendly|kid friendly|toddler|stroller)\b/i.test(ctx.msg);
    const profile = isKidFriendly ? 'kid_friendly' : 'default';

    const result = await getAttractions({ city, limit: 7, profile });

    if (result.ok) {
      const sourceName = result.source === 'opentripmap' ? 'OpenTripMap' : getSearchCitation();
      const reply = `Here are some attractions in ${city}:\n\n${result.summary}\n\nSource: ${sourceName}`;
      const citations = result.source ? [sourceName] : [];
      return { done: true, reply, citations };
    }
  } catch (error) {
    logger.log?.warn({ error: String(error), city }, 'attractions_tool_failed');
  }
  
  // Fallback to web search
  return webSearchNode(ctx, { ...mergedSlots, search_query: `${city} attractions things to do` }, logger);
}

async function flightsNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };
  
  // Try Amadeus API first
  try {
    const { searchFlights, convertToAmadeusDate } = await import('../tools/amadeus_flights.js');
    
    const departureDate = mergedSlots.departureDate || mergedSlots.dates;
    const returnDate = mergedSlots.returnDate;
    
    if (mergedSlots.originCity && (mergedSlots.destinationCity || mergedSlots.city) && departureDate) {
      const result = await searchFlights({
        origin: mergedSlots.originCity,
        destination: (mergedSlots.destinationCity || mergedSlots.city)!,
        departureDate: await convertToAmadeusDate(departureDate),
        returnDate: returnDate ? returnDate : undefined,
        passengers: mergedSlots.passengers ? parseInt(mergedSlots.passengers) : undefined,
        cabinClass: mergedSlots.cabinClass,
      });

      if (result.ok) {
        return { 
          done: true, 
          reply: result.summary, 
          citations: ['Amadeus Flight API - Live flight search results']
        };
      } else {
        // Amadeus returned no results or error → fallback to web with notice
        const converted = departureDate ? await convertToAmadeusDate(departureDate) : '';
        const query = `${mergedSlots.originCity} ${mergedSlots.destinationCity || mergedSlots.city} flights ${converted}`.trim();
        const web = await webSearchNode(ctx, { ...mergedSlots, search_query: query }, logger);
        if ('reply' in web) {
          web.reply = `I couldn't find availability via Amadeus${result && 'reason' in result ? ` (reason: ${result.reason})` : ''}. ` +
                      `Here are results from the web that might help.\n\n${web.reply}`;
        }
        return web;
      }
    }
  } catch (error) {
    logger.log?.warn({ error: String(error) }, 'amadeus_flights_failed');
    // Explicit web search fallback on error for flight flow
    const q = `${mergedSlots.originCity || ''} ${mergedSlots.destinationCity || mergedSlots.city || ''} flights ${mergedSlots.departureDate || mergedSlots.dates || ''}`.trim();
    if (q.replace(/\s+/g, '').length > 0) {
      const web = await webSearchNode(ctx, { ...mergedSlots, search_query: q }, logger);
      if ('reply' in web) {
        web.reply = `Amadeus search errored; showing web results instead.\n\n${web.reply}`;
      }
      return web;
    }
  }
  
  // Fallback to blend with facts (keeps policy/safety consistent). If the user
  // explicitly asked to "search" we can still provide helpful web results.
  if (/\bsearch\b/i.test(ctx.msg) && (mergedSlots.originCity || mergedSlots.destinationCity || mergedSlots.city)) {
    const q = `${mergedSlots.originCity || ''} ${mergedSlots.destinationCity || mergedSlots.city || ''} flights`.trim();
    const web = await webSearchNode(ctx, { ...mergedSlots, search_query: q }, logger);
    if ('reply' in web) {
      web.reply = `I can search the web while we confirm exact dates. ` +
                  `Please share your travel date to check live availability.\n\n${web.reply}`;
    }
    return web;
  }

  // Otherwise blend facts/ask clarifying questions
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'flights',
        needExternal: true,
        slots: mergedSlots,
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }), onStatus: ctx.onStatus },
  );
  return { done: true, reply, citations };
}

async function irropsNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const threadSlots = sanitizeSlotsView(getThreadSlots(ctx.threadId));
  const mergedSlots = { ...threadSlots, ...slots };

  try {
    const { processIrrops } = await import('../core/irrops_engine.js');
    const { parsePNRFromText } = await import('../tools/pnr_parser.js');
    
    logger.onStatus?.('Processing disruption...');
    
    // Parse PNR from message or use mock data for testing
    let pnr = await parsePNRFromText(ctx.msg);
    if (!pnr) {
      // Generate future date for mock PNR
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const futureDateTime = tomorrow.toISOString();
      const arrivalTime = new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000).toISOString(); // +3 hours
      
      // Mock PNR for testing - in production would require actual PNR data
      pnr = {
        recordLocator: mergedSlots.recordLocator || 'ABC123',
        passengers: [{ name: 'PASSENGER', type: 'ADT' }],
        segments: [{
          origin: mergedSlots.originCity || 'JFK',
          destination: mergedSlots.destinationCity || mergedSlots.city || 'LAX',
          departure: futureDateTime,
          arrival: arrivalTime,
          carrier: 'AA',
          flightNumber: 'AA123',
          cabin: 'Y',
          status: 'XX' // Cancelled
        }]
      };
    }

    // Classify disruption from message
    const message = ctx.msg.toLowerCase();
    let disruptionType: 'cancellation' | 'delay' | 'equipment_change' | 'user_request' = 'user_request';
    let severity: 'low' | 'medium' | 'high' = 'medium';
    
    if (message.includes('cancel')) {
      disruptionType = 'cancellation';
      severity = 'high';
    } else if (message.includes('delay')) {
      disruptionType = 'delay';
      severity = message.includes('hour') ? 'medium' : 'low';
    } else if (message.includes('equipment') || message.includes('aircraft')) {
      disruptionType = 'equipment_change';
      severity = 'medium';
    }

    const disruption = {
      type: disruptionType,
      severity,
      affectedSegments: [0], // Assume first segment affected
      timestamp: new Date().toISOString(),
      reason: `Disruption detected: ${disruptionType}`
    };

    const preferences = {
      maxPriceIncrease: mergedSlots.maxPriceIncrease ? parseFloat(mergedSlots.maxPriceIncrease) : undefined,
      preferredCarriers: mergedSlots.preferredCarriers?.split(','),
      minConnectionTime: mergedSlots.minConnectionTime ? parseInt(mergedSlots.minConnectionTime) : undefined
    };

    const options = await processIrrops(pnr, disruption, preferences);

    if (!options || options.length === 0) {
      return { done: true, reply: 'I couldn\'t find any suitable rebooking options. Please contact your airline directly or try again with different preferences.' };
    }

    // Format the response
    const optionsText = options.map((option, index) => {
      const priceText = option.priceChange.amount > 0 
        ? `Additional cost: $${option.priceChange.amount} ${option.priceChange.currency}`
        : option.priceChange.amount < 0 
        ? `Refund: $${Math.abs(option.priceChange.amount)} ${option.priceChange.currency}`
        : 'No additional cost';
      
      const routeText = option.segments.map(seg => 
        `${seg.carrier}${seg.flightNumber.replace(seg.carrier, '')} ${seg.origin}-${seg.destination}`
      ).join(', ');

      return `**Option ${index + 1}** (${option.type.replace('_', ' ')}):\n` +
             `Route: ${routeText}\n` +
             `${priceText}\n` +
             `Confidence: ${Math.round(option.confidence * 100)}%\n` +
             `Rules: ${option.rulesApplied.slice(0, 2).join(', ')}`;
    }).join('\n\n');

    const reply = `I found ${options.length} rebooking options for your disruption:\n\n${optionsText}\n\n` +
                  `All options have been validated against airline policies and connection requirements. ` +
                  `Would you like me to proceed with one of these options?`;

    const citations = options.flatMap(opt => opt.citations).slice(0, 3);
    
    return { done: true, reply, citations };
    
  } catch (error) {
    logger.log?.warn({ error: String(error) }, 'irrops_processing_failed');
    return { done: true, reply: 'I\'m having trouble processing your disruption request. Please try again or contact your airline directly for assistance.' };
  }
}

async function policyNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  try {
    const { PolicyAgent } = await import('./policy_agent.js');
    const agent = new PolicyAgent();
    
    // Check if user wants receipts/citations
    const wantReceipts = /receipt|citation|proof|evidence|source/i.test(ctx.msg);
    
    const { answer, citations, receipts, needsWebSearch, assessmentReason } = await agent.answer(ctx.msg, undefined, ctx.threadId, logger.log, wantReceipts);
    
    // Check if no results found or quality assessment suggests web search
    const noRelevantInfo = !citations.length || 
                          citations.every(c => !c.snippet?.trim()) ||
                          /do not specify|cannot determine|not found|no information|don't contain/i.test(answer);
    
    // If we have successful receipts, use them even if needsWebSearch is true
    const hasSuccessfulReceipts = receipts && receipts.length > 0 && receipts.some(r => r.confidence >= 0.6);

    // Route to web search if needed (but not if we have good receipts)
    if ((noRelevantInfo || needsWebSearch) && !hasSuccessfulReceipts) {
      // For visa questions, auto-fallback to web search
      if (/\b(visa|passport|entry requirements?|immigration)\b/i.test(ctx.msg)) {
        const webResult = await webSearchNode(ctx, { ...slots, search_query: ctx.msg }, logger);
        if ('reply' in webResult && webResult.reply) {
          webResult.reply = `I don't have this information in our internal database, but let me search the web for current details:\n\n${webResult.reply}`;
        }
        return webResult;
      }
      
      // For other policy questions, ask for consent
      writeConsentState(ctx.threadId, { type: 'web_after_rag', pending: ctx.msg });
      
      const reason = needsWebSearch ? `Quality assessment: ${assessmentReason}` : 'No relevant information found';
      return { 
        done: true, 
        reply: `I couldn't find sufficient information about this in our internal knowledge base (${reason}). Would you like me to search the web for current information? Type 'yes' to proceed with web search, or ask me something else.`,
        citations: ['Internal Knowledge Base (Insufficient Results)']
      };
    }
    
    // Prefer synthesizing from receipts when we have high-confidence browser content
    let finalAnswer = answer;
    let displayCitations: Array<{ url?: string; title?: string; snippet?: string; score?: number }> = citations;
    if (hasSuccessfulReceipts) {
      try {
        const summarizer = await getPrompt('policy_summarizer');
        const ctxText = (receipts || [])
          .map((r, i) => `[${i + 1}] Source: ${r.url}\n${r.quote}`)
          .join('\n\n');
        const prompt = summarizer
          .replace('{question}', ctx.msg)
          .replace('{context}', ctxText);
        const receiptsAnswer = await callLLM(prompt, { log: logger.log });
        const cleaned = receiptsAnswer.trim();
        const looksUseful = cleaned.length > 0 && !/no information available/i.test(cleaned);
        // Override when original looks insufficient or when we have a solid receipts-based answer
        if (looksUseful && (noRelevantInfo || cleaned.length >= Math.min(60, answer.length))) {
          finalAnswer = cleaned;
          displayCitations = (receipts || []).map(r => ({ url: r.url, title: new URL(r.url).hostname + ' policy', snippet: r.quote, score: r.confidence }));
        }
      } catch (e) {
        logger.log?.debug({ error: String(e) }, 'receipt_synthesis_failed_fallback_to_rag_summary');
      }
    }

    // Format answer with sources and receipts
    let formattedAnswer = displayCitations.length > 0 
      ? `${finalAnswer}\n\nSources:\n${displayCitations.map((c, i) => `${i + 1}. ${c.title ?? 'Internal Knowledge Base'}${c.url ? ` — ${c.url}` : ''}`).join('\n')}`
      : finalAnswer;
    
    // Add receipts if available
    if (receipts && receipts.length > 0) {
      const receiptText = receipts.map((r, i) => 
        `${i + 1}. ${r.url} (confidence: ${(r.confidence * 100).toFixed(0)}%)\n   "${r.quote.slice(0, 150)}..."`
      ).join('\n');
      formattedAnswer += `\n\nPolicy Receipts:\n${receiptText}`;
    }
    
    // Store facts for /why command
    const { setLastReceipts } = await import('./slot_memory.js');
    const facts = displayCitations.map((c, i) => ({
      key: `policy_citation_${i}`,
      value: c.snippet || c.title || 'Policy information',
      source: c.title || c.url || 'Internal Knowledge Base'
    }));
    const decisions = [`Retrieved ${displayCitations.length} policy citations with receipts integration`];
    setLastReceipts(ctx.threadId, facts, decisions, formattedAnswer);
    
    const citationTitles = displayCitations.map(c => c.title || c.url || 'Internal Knowledge Base');
    return { done: true, reply: formattedAnswer, citations: citationTitles };
    
  } catch (error) {
    logger.log?.warn({ error: String(error), message: ctx.msg }, 'policy_agent_failed');
    return webSearchNode(ctx, slots, logger);
  }
}

async function systemNode(ctx: NodeCtx): Promise<NodeOut> {
  // Check if deep research consent is needed
  const slots = getThreadSlots(ctx.threadId);
  const consentState = readConsentState(slots);
  
  if (consentState.awaiting && consentState.type === 'deep' && consentState.pending) {
    return {
      done: true,
      reply: 'This looks like a complex travel planning request that would benefit from deeper research. Would you like me to search for comprehensive information to help with your trip planning?'
    };
  }
  
  return {
    done: true,
    reply: 'I\'m an AI travel assistant. I can help you with weather, destinations, packing, and attractions. What would you like to know?',
  };
}

async function webSearchNode(
  ctx: NodeCtx,
  slots: Record<string, string>,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
  const searchQuery = sanitizeSearchQuery(slots.search_query || ctx.msg);
  const optimizedQuery = slots.search_query 
    ? searchQuery 
    : await optimizeSearchQuery(searchQuery, slots, 'web_search', logger.log);
  
  return await performWebSearchNode(optimizedQuery, logger, ctx.threadId);
}

async function unknownNode(
  ctx: NodeCtx,
  logger: { log: pino.Logger; onStatus?: (status: string) => void }
): Promise<NodeOut> {
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

// === SEARCH NODES ===

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
      const facts = searchResult.results.slice(0, 3).map(
        (result: SearchResult, index: number) => ({
          source: getSearchCitation(),
          key: `search_result_${index}`,
          value: `${result.title}: ${result.description.slice(0, 100)}...`,
        }),
      );
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
    
    // Truncate if too long
    if (sanitized.length > 2000) {
      const sentences = sanitized.split(/[.!?]+/);
      let truncated = '';
      for (const sentence of sentences) {
        if ((truncated + sentence).length > 1900) break;
        truncated += sentence + '.';
      }
      sanitized = truncated;
    }
    
    // Ensure Sources block present
    const hasLinks = /https?:\/\//i.test(sanitized) || /Sources:/i.test(sanitized);
    let finalText = sanitized;
    if (!hasLinks) {
      const sourcesBlock = ['Sources:', ...formattedResults.slice(0, 5).map(r => `${r.id}. ${r.title} - ${r.url}`)].join('\n');
      finalText = `${sanitized}\n\n${sourcesBlock}`;
    }
    
    return {
      reply: finalText,
      citations: [getSearchCitation()]
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
    reply: `Based on web search results:\n\n${formattedResults}\n\nSources: ${getSearchCitation()}`,
    citations: [getSearchCitation()]
  };
}
