import { routeIntent } from './router.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { getThreadSlots, updateThreadSlots, setLastIntent, getLastIntent } from './slot_memory.js';
import { searchTravelInfo } from '../tools/brave_search.js';
import type pino from 'pino';
import pinoLib from 'pino';

export type NodeCtx = { msg: string; threadId: string };
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'unknown' | 'web_search'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

export async function runGraphTurn(
  message: string,
  threadId: string,
  ctx: { log: pino.Logger },
): Promise<NodeOut> {
  // Check for budget queries - process as destination query with disclaimer
  const budgetPatterns = [
    /budget|cost|price|money|expensive|cheap|afford|spend|currency exchange|exchange rate/i
  ];
  
  const isBudgetQuery = budgetPatterns.some(pattern => pattern.test(message));
  let budgetDisclaimer = '';
  if (isBudgetQuery) {
    budgetDisclaimer = 'I can\'t help with budget planning or costs, but I can provide travel destination information. ';
  }

  // Handle consent responses for web search
  const threadSlots = getThreadSlots(threadId);
  const awaitingSearchConsent = threadSlots.awaiting_search_consent === 'true';
  const pendingSearchQuery = threadSlots.pending_search_query;
  
  if (awaitingSearchConsent && pendingSearchQuery) {
    const consentPatterns = [
      /^(yes|yeah|yep|sure|ok|okay|please|do it|go ahead|search)/i,
      /^(no|nope|not now|maybe later|skip)/i
    ];
    
    const isConsentResponse = consentPatterns.some(pattern => pattern.test(message.trim()));
    
    if (isConsentResponse) {
      const isPositiveConsent = /^(yes|yeah|yep|sure|ok|okay|please|do it|go ahead|search)/i.test(message.trim());
      
      // Clear consent state
      updateThreadSlots(threadId, { 
        awaiting_search_consent: '', 
        pending_search_query: '' 
      }, []);
      
      if (isPositiveConsent) {
        return await performWebSearchNode(pendingSearchQuery, ctx, threadId);
      } else {
        return {
          done: true,
          reply: 'No problem! Is there something else about travel planning I can help with?',
        };
      }
    }
  }

  const routeCtx: NodeCtx = { msg: message, threadId };
  const routeResult = await routeIntentNode(routeCtx, ctx);
  if ('done' in routeResult) {
    return routeResult;
  }
  // Handle follow-up responses: if intent is unknown but we have prior context, try to infer intent
  let intent = routeResult.next;
  const prior = getThreadSlots(threadId);
  const slots = { ...prior, ...(routeResult.slots || {}) };
  
  // If intent is unknown but we have context and new slots, infer intent from last interaction
  if (intent === 'unknown' && Object.keys(prior).length > 0 && Object.keys(routeResult.slots || {}).length > 0) {
    const lastIntent = getLastIntent(threadId);
    if (lastIntent && lastIntent !== 'unknown') {
      intent = lastIntent;
      if (ctx.log && typeof ctx.log.debug === 'function') {
        ctx.log.debug({ originalIntent: 'unknown', inferredIntent: intent, prior, newSlots: routeResult.slots }, 'intent_inference');
      }
    }
  }
  
  setLastIntent(threadId, intent);
  if (ctx.log && typeof ctx.log.debug === 'function') {
    ctx.log.debug({ prior, extracted: routeResult.slots, merged: slots, intent }, 'slot_merge');
  }
  
  const needsCity = intent === 'attractions' || intent === 'packing' || intent === 'destinations' || intent === 'weather';
  const hasCity = typeof slots.city === 'string' && slots.city.trim().length > 0;
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
    const flightPatterns = [
      /airline|flight|fly|plane|ticket|booking/i,
      /what\s+airlines/i,
      /which\s+airlines/i
    ];
    
    const isFlightQuery = flightPatterns.some(pattern => pattern.test(message));
    
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
    updateThreadSlots(threadId, slots as Record<string, string>, missing);
    const q = buildClarifyingQuestion(missing, slots as Record<string, string>);
    if (ctx.log && typeof ctx.log.debug === 'function') {
      ctx.log.debug({ missing, q }, 'clarifier');
    }
    return { done: true, reply: q };
  }
  // Persist merged slots once complete
  updateThreadSlots(threadId, slots as Record<string, string>, []);

  // Use merged slots for downstream nodes
  const mergedSlots = slots as Record<string, string>;

  switch (intent) {
    case 'destinations':
      return destinationsNode(routeCtx, mergedSlots, ctx, budgetDisclaimer);
    case 'weather':
      return weatherNode(routeCtx, mergedSlots, ctx);
    case 'packing':
      return packingNode(routeCtx, mergedSlots, ctx);
    case 'attractions':
      return attractionsNode(routeCtx, mergedSlots, ctx);
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
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'weather',
        needExternal: false,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function destinationsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'destinations',
        needExternal: true,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  const finalReply = disclaimer ? disclaimer + reply : reply;
  return { done: true, reply: finalReply, citations };
}

async function packingNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'packing',
        needExternal: false,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function attractionsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'attractions',
        needExternal: true,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function webSearchNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const searchQuery = slots?.search_query || ctx.msg;
  return await performWebSearchNode(searchQuery, logger || { log: pinoLib({ level: 'silent' }) }, ctx.threadId);
}

async function performWebSearchNode(
  query: string,
  ctx: { log: pino.Logger },
  threadId: string,
): Promise<NodeOut> {
  ctx.log.debug({ query }, 'performing_web_search_node');
  
  const searchResult = await searchTravelInfo(query);
  
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
  
  // Format search results for travel context
  const results = searchResult.results.slice(0, 3); // Limit to top 3 results
  const formattedResults = results.map(result => {
    // Decode HTML entities and clean up description
    const cleanTitle = result.title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const cleanDesc = result.description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const truncatedDesc = cleanDesc.slice(0, 100) + (cleanDesc.length > 100 ? '...' : '');
    return `• ${cleanTitle} - ${truncatedDesc}`;
  }).join('\n');
  
  const reply = `Based on web search results:\n\n${formattedResults}\n\nSources: Brave Search`;
  
  // Store search receipts
  if (threadId) {
    try {
      const { setLastReceipts } = await import('./slot_memory.js');
      const facts = results.map((result, index) => ({
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
    citations: ['Brave Search'],
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
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}
