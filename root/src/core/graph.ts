import { routeIntent } from './router.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { getThreadSlots, updateThreadSlots, setLastIntent, getLastIntent } from './slot_memory.js';
import { searchTravelInfo } from '../tools/brave_search.js';
import { callLLM, classifyContent, optimizeSearchQuery } from './llm.js';
import { getPrompt } from './prompts.js';
import type pino from 'pino';
import pinoLib from 'pino';

async function detectConsent(
  message: string,
  ctx: { log: pino.Logger },
): Promise<'yes' | 'no' | 'unclear'> {
  const promptTemplate = await getPrompt('consent_detector');
  const prompt = promptTemplate.replace('{message}', message);

  try {
    const response = await callLLM(prompt, { log: ctx.log });
    const answer = response.toLowerCase().trim();
    if (answer.includes('yes')) return 'yes';
    if (answer.includes('no')) return 'no';
    return 'unclear';
  } catch {
    return 'unclear';
  }
}

export type NodeCtx = { msg: string; threadId: string };
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'unknown' | 'web_search' | 'system'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

export async function runGraphTurn(
  message: string,
  threadId: string,
  ctx: { log: pino.Logger },
): Promise<NodeOut> {
  // Use LLM for budget query detection with fallback
  let isBudgetQuery = false;
  let budgetDisclaimer = '';
  
  try {
    const contentClassification = await classifyContent(message, ctx.log);
    isBudgetQuery = contentClassification?.content_type === 'budget';
  } catch {
    // Fallback to regex patterns
    const budgetPatterns = [
      /budget|cost|price|money|expensive|cheap|afford|spend|currency exchange|exchange rate/i
    ];
    isBudgetQuery = budgetPatterns.some(pattern => pattern.test(message));
  }
  
  if (isBudgetQuery) {
    budgetDisclaimer = 'I can\'t help with budget planning or costs, but I can provide travel destination information. ';
  }

  // Handle consent responses for web search
  const threadSlots = getThreadSlots(threadId);
  const awaitingSearchConsent = threadSlots.awaiting_search_consent === 'true';
  const pendingSearchQuery = threadSlots.pending_search_query;
  
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

  const routeCtx: NodeCtx = { msg: message, threadId };
  const routeResult = await routeIntentNode(routeCtx, ctx);
  if ('done' in routeResult) {
    return routeResult;
  }
  // Handle follow-up responses: if intent is unknown but we have prior context, try to infer intent
  let intent = routeResult.next;
  const prior = getThreadSlots(threadId);
  
  // Filter out placeholder values from extracted slots, but only for city switching
  const extractedSlots = routeResult.slots || {};
  const filteredSlots: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(extractedSlots)) {
    if (typeof value === 'string' && value.trim()) {
      // For city: reject placeholders only if we have a prior city and this looks like a placeholder
      if (key === 'city' && prior.city && 
          ['unknown', 'clean_city_name', 'there', 'normalized_name'].includes(value.toLowerCase())) {
        continue; // Skip placeholder, keep prior city
      }
      // For other fields: reject obvious placeholders
      if (!['unknown', 'clean_city_name', 'there', 'next week', 'normalized_date_string', 'month_name'].includes(value.toLowerCase())) {
        filteredSlots[key] = value;
      }
    }
  }
  
  const slots = { ...prior, ...filteredSlots };
  
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
    updateThreadSlots(threadId, slots as Record<string, string>, missing);
    const q = await buildClarifyingQuestion(missing, slots as Record<string, string>, ctx.log);
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
  // Use thread slots to ensure we have the latest context
  const threadSlots = getThreadSlots(ctx.threadId);
  const mergedSlots = { ...threadSlots, ...(slots || {}) };
  
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'destinations',
        needExternal: true,
        slots: mergedSlots,
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

async function systemNode(ctx: NodeCtx): Promise<NodeOut> {
  return {
    done: true,
    reply: "I'm a travel assistant. I can help with destinations, weather, packing, and attractions. Share origin, rough dates, who's traveling, budget, and any constraints (e.g., stroller, flight length).",
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
    
    return {
      reply: sanitized,
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
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}
