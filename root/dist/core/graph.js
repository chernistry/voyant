import { routeIntent } from './router.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { getThreadSlots, updateThreadSlots, setLastIntent, getLastIntent } from './slot_memory.js';
import { searchTravelInfo } from '../tools/brave_search.js';
import { callLLM, classifyContent, optimizeSearchQuery } from './llm.js';
import { getPrompt } from './prompts.js';
import pinoLib from 'pino';
async function detectConsent(message, ctx) {
    const promptTemplate = await getPrompt('consent_detector');
    const prompt = promptTemplate.replace('{message}', message);
    try {
        const response = await callLLM(prompt, { log: ctx.log });
        const answer = response.toLowerCase().trim();
        if (answer.includes('yes'))
            return 'yes';
        if (answer.includes('no'))
            return 'no';
        return 'unclear';
    }
    catch {
        return 'unclear';
    }
}
export async function runGraphTurn(message, threadId, ctx) {
    // Use LLM for budget query detection with fallback
    let isBudgetQuery = false;
    let budgetDisclaimer = '';
    try {
        const contentClassification = await classifyContent(message, ctx.log);
        isBudgetQuery = contentClassification?.content_type === 'budget';
    }
    catch {
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
                const optimizedQuery = await optimizeSearchQuery(pendingSearchQuery, threadSlots, 'web_search', ctx.log);
                return await performWebSearchNode(optimizedQuery, ctx, threadId);
            }
            else {
                return {
                    done: true,
                    reply: 'No problem! Is there something else about travel planning I can help with?',
                };
            }
        }
    }
    const routeCtx = { msg: message, threadId };
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
    const missing = [];
    if (needsCity && !hasCity)
        missing.push('city');
    if (intent === 'destinations' && !hasWhen)
        missing.push('dates');
    if (intent === 'packing' && !hasWhen && !hasImmediateContext && !hasSpecialContext)
        missing.push('dates');
    // Weather queries do NOT require dates - they can provide current weather
    // Check for flight queries in destinations intent that should trigger web search instead of asking for dates
    if (intent === 'destinations' && missing.includes('dates')) {
        let isFlightQuery = false;
        try {
            const contentClassification = await classifyContent(message, ctx.log);
            isFlightQuery = contentClassification?.content_type === 'flight';
        }
        catch {
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
        updateThreadSlots(threadId, slots, missing);
        const q = await buildClarifyingQuestion(missing, slots, ctx.log);
        if (ctx.log && typeof ctx.log.debug === 'function') {
            ctx.log.debug({ missing, q }, 'clarifier');
        }
        return { done: true, reply: q };
    }
    // Persist merged slots once complete
    updateThreadSlots(threadId, slots, []);
    // Use merged slots for downstream nodes
    const mergedSlots = slots;
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
async function routeIntentNode(ctx, logger) {
    const r = await routeIntent({ message: ctx.msg, threadId: ctx.threadId, logger });
    return { next: r.intent, slots: r.slots };
}
async function weatherNode(ctx, slots, logger) {
    const { reply, citations } = await blendWithFacts({
        message: ctx.msg,
        route: {
            intent: 'weather',
            needExternal: false,
            slots: slots || {},
            confidence: 0.7,
        },
        threadId: ctx.threadId,
    }, logger || { log: pinoLib({ level: 'silent' }) });
    return { done: true, reply, citations };
}
async function destinationsNode(ctx, slots, logger, disclaimer) {
    const { reply, citations } = await blendWithFacts({
        message: ctx.msg,
        route: {
            intent: 'destinations',
            needExternal: true,
            slots: slots || {},
            confidence: 0.7,
        },
        threadId: ctx.threadId,
    }, logger || { log: pinoLib({ level: 'silent' }) });
    const finalReply = disclaimer ? disclaimer + reply : reply;
    return { done: true, reply: finalReply, citations };
}
async function packingNode(ctx, slots, logger) {
    const { reply, citations } = await blendWithFacts({
        message: ctx.msg,
        route: {
            intent: 'packing',
            needExternal: false,
            slots: slots || {},
            confidence: 0.7,
        },
        threadId: ctx.threadId,
    }, logger || { log: pinoLib({ level: 'silent' }) });
    return { done: true, reply, citations };
}
async function attractionsNode(ctx, slots, logger) {
    const { reply, citations } = await blendWithFacts({
        message: ctx.msg,
        route: {
            intent: 'attractions',
            needExternal: true,
            slots: slots || {},
            confidence: 0.7,
        },
        threadId: ctx.threadId,
    }, logger || { log: pinoLib({ level: 'silent' }) });
    return { done: true, reply, citations };
}
async function webSearchNode(ctx, slots, logger) {
    const searchQuery = slots?.search_query || ctx.msg;
    // Optimize the search query if not already optimized
    const optimizedQuery = slots?.search_query
        ? searchQuery // Already optimized in router
        : await optimizeSearchQuery(searchQuery, slots || {}, 'web_search', logger?.log);
    return await performWebSearchNode(optimizedQuery, logger || { log: pinoLib({ level: 'silent' }) }, ctx.threadId);
}
async function performWebSearchNode(query, ctx, threadId) {
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
        }
        catch {
            // ignore receipt storage errors
        }
    }
    return {
        done: true,
        reply,
        citations,
    };
}
async function summarizeSearchResults(results, query, ctx) {
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
        if (sanitized.length > 400) {
            const sentences = sanitized.split(/[.!?]+/);
            let truncated = '';
            for (const sentence of sentences) {
                if ((truncated + sentence).length > 380)
                    break;
                truncated += sentence + '.';
            }
            sanitized = truncated;
        }
        return {
            reply: sanitized,
            citations: ['Brave Search']
        };
    }
    catch (error) {
        ctx.log.debug('Search summarization failed, using fallback');
        return formatSearchResultsFallback(results);
    }
}
function formatSearchResultsFallback(results) {
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
async function unknownNode(ctx, logger) {
    const { reply, citations } = await blendWithFacts({
        message: ctx.msg,
        route: {
            intent: 'unknown',
            needExternal: false,
            slots: {},
            confidence: 0.3,
        },
        threadId: ctx.threadId,
    }, logger || { log: pinoLib({ level: 'silent' }) });
    return { done: true, reply, citations };
}
