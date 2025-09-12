import type pino from 'pino';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ChatInputT, ChatOutput } from '../schemas/chat.js';
import { getThreadId, pushMessage } from './memory.js';
import { runGraphTurn } from './graph.js';
import { callLLM, callLLMBatch, optimizeSearchQuery } from './llm.js';
import { classifyContentLLM } from './nlp.js';
import { getPrompt } from './prompts.js';
import { getWeather } from '../tools/weather.js';
import { getCountryFacts } from '../tools/country.js';
import { getAttractions } from '../tools/attractions.js';
import {
  searchTravelInfo,
  getSearchCitation,
  getSearchSource,
} from '../tools/search.js';
import type { SearchResult } from '../tools/search.js';
import { validateNoCitation } from './citations.js';
import type { Fact } from './receipts.js';
import { getLastReceipts, setLastReceipts, updateThreadSlots } from './slot_memory.js';
import { buildReceiptsSkeleton, ReceiptsSchema } from './receipts.js';
import { verifyAnswer } from './verify.js';
import { planBlend, type BlendPlan } from './blend.planner.js';
import { summarizeSearch } from './searchSummarizer.js';
import { composeWeatherReply, composePackingReply, composeAttractionsReply } from './composers.js';

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
async function performWebSearch(
  query: string,
  ctx: { log: pino.Logger; onStatus?: (status: string) => void },
  threadId?: string,
  plan?: BlendPlan,
): Promise<{ reply: string; citations?: string[] }> {
  ctx.log.debug({ query }, 'performing_web_search');
  // Opt-in deep research path
  if (process.env.DEEP_RESEARCH_ENABLED === 'true') {
    try {
      const { performDeepResearch } = await import('./deep_research.js');
      const research = await performDeepResearch(query, { threadId }, ctx.log);
      // Verify answer using existing verifier
      try {
        const facts = research.citations.map((c, i) => ({ source: c.source, key: `deep_${i}`, value: c.url }));
        const audit = await verifyAnswer({ reply: research.summary, facts, log: ctx.log });
        if (audit.verdict === 'fail' && audit.revisedAnswer) {
          return { reply: audit.revisedAnswer, citations: research.citations.map((c) => c.source) };
        }
      } catch {}
      return { reply: research.summary, citations: research.citations.map((c) => c.source) };
    } catch (e) {
      ctx.log.warn({ e: e instanceof Error ? e.message : String(e) }, 'deep_research_failed_fallback_single_search');
    }
  }
  
  // Determine if this needs Crawlee deep research
  const isComplexQuery = query.length > 50 || 
                         /detailed|comprehensive|in-depth|analysis|research|study/.test(query) ||
                         /budget.*plan|itinerary|guide/.test(query);
  
  ctx.log.debug({ query, isComplexQuery, queryLength: query.length }, 'complex_query_detection');
  
  ctx.onStatus?.('Searching the web...');
  
  const searchResult = await searchTravelInfo(query, ctx.log, isComplexQuery);
  
  if (!searchResult.ok) {
    ctx.log.debug({ reason: searchResult.reason }, 'web_search_failed');
    return {
      reply: 'I\'m unable to search the web right now. Could you ask me something about weather, destinations, packing, or attractions instead?',
      citations: undefined,
    };
  }
  
  if (searchResult.results.length === 0) {
    return {
      reply: 'I couldn\'t find relevant information for your search. Could you try rephrasing your question or ask me about weather, destinations, packing, or attractions?',
      citations: undefined,
    };
  }
  
  // Use deep research summary if available, otherwise regular summarization
  let reply: string;
  let citations: string[];
  
  if (searchResult.deepSummary) {
    reply = searchResult.deepSummary;
    citations = [`${getSearchCitation()} + Deep Research`];
    ctx.log.debug('using_crawlee_deep_research_summary');
  } else {
    const useLLM = plan?.summarize_web_with_llm ?? (searchResult.results.length >= 3);
    const result = await summarizeSearch(searchResult.results, query, useLLM, ctx);
    reply = result.reply;
    citations = result.citations || [getSearchCitation()];
  }
  
  // Store search facts for receipts
  if (threadId) {
    try {
      const facts: Fact[] = searchResult.results.slice(0, 3).map(
        (result: SearchResult, index: number) => ({
          source: getSearchCitation(),
          key: `search_result_${index}`,
          value: `${result.title}: ${result.description}`,
        }),
      );
      const decisions = ['Used web search because user requested search or question couldn\'t be answered by travel APIs.'];
      setLastReceipts(threadId, facts, decisions, reply);
    } catch {
      // ignore
    }
  }
  
  return { reply, citations };
}

export async function handleChat(
  input: ChatInputT,
  ctx: { log: pino.Logger; onStatus?: (status: string) => void },
) {
  // Early handling for empty/emoji-only or non-informative inputs
  const raw = input.message || '';
  const trimmed = raw.trim();
  const emojiOnly = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(raw);
  const nonAlphaNum = !/[a-zA-Z0-9]/.test(raw);
  if (trimmed.length === 0 || emojiOnly || (raw.length <= 6 && nonAlphaNum)) {
    const reply = "I'm a travel assistant. Please share a travel question (weather, destinations, packing, or attractions).";
    const threadId = getThreadId(input.threadId);
    return ChatOutput.parse({ reply, threadId });
  }
  
  ctx.onStatus?.('Analyzing your request...');
  
  const threadId = getThreadId(input.threadId);
  const wantReceipts = Boolean((input as { receipts?: boolean }).receipts) ||
    /^\s*\/why\b/i.test(input.message);
  if (wantReceipts) {
    const stored = getLastReceipts(threadId) || {};
    const facts = stored.facts || [];
    const decisions = stored.decisions || [];
    let reply = stored.reply || 'No previous answer to explain.';
    const token_estimate = 400;
    const receipts = buildReceiptsSkeleton(facts as Fact[], decisions, token_estimate);
    try {
      const audit = await verifyAnswer({
        reply,
        facts: (facts as Fact[]).map((f) => ({ key: f.key, value: f.value, source: String(f.source) })),
        log: ctx.log,
      });
      if (audit.verdict === 'fail' && audit.revisedAnswer) {
        reply = audit.revisedAnswer;
      }
      const merged = { ...receipts, selfCheck: { verdict: audit.verdict, notes: audit.notes } };
      const safe = ReceiptsSchema.parse(merged);
      
      // For /why commands, return only receipts content as reply
      const receiptsReply = `--- RECEIPTS ---\n\nSources: ${receipts.sources.join(', ')}\n\nDecisions: ${decisions.join(' ')}\n\nSelf-Check: ${audit.verdict}${audit.notes.length > 0 ? ` (${audit.notes.join(', ')})` : ''}\n\nBudget: ${receipts.budgets.ext_api_latency_ms || 0}ms API, ~${token_estimate} tokens`
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      
      return ChatOutput.parse({ reply: receiptsReply, threadId, sources: receipts.sources, receipts: safe });
    } catch {
      const receiptsReply = `--- RECEIPTS ---\n\nSources: ${receipts.sources.join(', ')}\n\nDecisions: ${decisions.join(' ')}\n\nSelf-Check: not available\n\nBudget: ${receipts.budgets.ext_api_latency_ms || 0}ms API, ~${token_estimate} tokens`
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      return ChatOutput.parse({ reply: receiptsReply, threadId, sources: receipts.sources });
    }
  }
  pushMessage(threadId, { role: 'user', content: input.message });
  ctx.onStatus?.('Processing your travel request...');
  const result = await runGraphTurn(input.message, threadId, ctx);
  if ('done' in result) {
    pushMessage(threadId, { role: 'assistant', content: result.reply });

    // Handle receipts if requested
    const wantReceipts = Boolean((input as { receipts?: boolean }).receipts) ||
      /^\s*\/why\b/i.test(input.message);
    if (wantReceipts) {
      const stored = getLastReceipts(threadId) || {};
      const facts = stored.facts || [];
      const decisions = stored.decisions || [];
      let reply = result.reply;
      const token_estimate = 400;
      const receipts = buildReceiptsSkeleton(facts as Fact[], decisions, token_estimate);
      try {
        const audit = await verifyAnswer({
          reply,
          facts: (facts as Fact[]).map((f) => ({ key: f.key, value: f.value, source: String(f.source) })),
          log: ctx.log,
        });
        if (audit.verdict === 'fail' && audit.revisedAnswer) {
          reply = audit.revisedAnswer;
        }
        const merged = { ...receipts, selfCheck: { verdict: audit.verdict, notes: audit.notes } };
        const safe = ReceiptsSchema.parse(merged);
        return ChatOutput.parse({ reply, threadId, sources: receipts.sources, receipts: safe });
      } catch {
        return ChatOutput.parse({ reply, threadId, sources: receipts.sources });
      }
    }

    return ChatOutput.parse({
      reply: result.reply,
      threadId,
      citations: result.citations,
    });
  }
  // Fallback if graph doesn't complete
  pushMessage(threadId, {
    role: 'assistant',
    content: 'I need more information to help you.',
  });
  return ChatOutput.parse({
    reply: 'I need more information to help you.',
    threadId,
  });
}

type RouterResultT = {
  intent: string;
  needExternal: boolean;
  slots: Record<string, string>;
  confidence: number;
};

type PackingData = { hot: string[]; mild: string[]; cold: string[] };
let PACKING: PackingData = { hot: [], mild: [], cold: [] };
let packingLoaded = false;
async function loadPackingOnce() {
  if (packingLoaded) return;
  try {
    const file = path.join(process.cwd(), 'src', 'data', 'packing.json');
    const txt = await readFile(file, 'utf-8');
    PACKING = JSON.parse(txt) as PackingData;
    packingLoaded = true;
  } catch {
    PACKING = { hot: [], mild: [], cold: [] };
    packingLoaded = true;
  }
}

export async function blendWithFacts(
  input: { message: string; route: RouterResultT; threadId?: string },
  ctx: { log: pino.Logger; onStatus?: (status: string) => void },
) {
  // Single planner LLM call to drive all decisions
  const plan = await planBlend(input.message, input.route, ctx.log);
  
  // Early exits based on planner decisions
  if (plan.safety.disallowed_topic) {
    return {
      reply: plan.safety.reason || "I can't help with that topic. Please ask about travel planning instead.",
      citations: undefined,
    };
  }
  
  if (plan.unrelated) {
    return {
      reply: "I'm a travel assistant focused on helping with weather, destinations, packing, and attractions. Could you ask me something about travel planning?",
      citations: undefined,
    };
  }
  
  if (plan.system_question) {
    return {
      reply: 'I\'m an AI travel assistant designed to help with weather, destinations, packing advice, and attractions. How can I help with your travel planning?',
      citations: undefined,
    };
  }
  
  if (plan.explicit_search) {
    let searchQuery = input.message.replace(/^(search|google)\s+(web|online|for)?\s*/i, '').trim();
    if (!searchQuery) searchQuery = input.message;
    
    ctx.onStatus?.('Searching for travel information...');
    const optimizedQuery = await optimizeSearchQuery(
      searchQuery,
      input.route.slots,
      'web_search',
      ctx.log
    );
    
    return await performWebSearch(optimizedQuery, ctx, input.threadId, plan);
  }
  
  // Handle missing slots
  if (plan.missing_slots.length > 0) {
    const missing = plan.missing_slots[0];
    if (missing === 'city') {
      return { reply: "Which city are you interested in?", citations: undefined };
    }
    if (missing === 'dates') {
      return { reply: "When are you planning to travel?", citations: undefined };
    }
  }
  
  // Trust the slot extraction - if LLM found a city, use it
  const cityHint = input.route.slots.city && input.route.slots.city.trim();
  const whenHint = (input.route.slots.dates && input.route.slots.dates.trim()) || 
                   (input.route.slots.month && input.route.slots.month.trim());
                   
  if (input.route.intent === 'unknown') {
    return {
      reply: 'Could you share the city and month/dates?',
      citations: undefined,
    };
  }
  
  // Check for restaurant/food queries in attractions intent
  if (input.route.intent === 'attractions') {
    if (plan.query_facets.wants_restaurants && input.threadId) {
      // Store the pending search query and set consent state
      updateThreadSlots(input.threadId, {
        awaiting_search_consent: 'true',
        pending_search_query: input.message
      }, []);
      
      const searchType = 'restaurant recommendations';
      return {
        reply: `I can search the web to find current ${searchType}. Would you like me to do that?`,
        citations: undefined,
      };
    }
  }
  
  // Avoid accidental web search for refinements; only trigger when explicitly asked
  if (input.route.intent === 'destinations' || input.route.intent === 'packing') {
    if (plan.explicit_search) {
      return await performWebSearch(input.message, ctx, input.threadId, plan);
    }
  }

  // Check for budget/cost queries in destinations intent
  if (input.route.intent === 'destinations') {
    if (plan.query_facets.wants_flights && input.threadId) {
      updateThreadSlots(input.threadId, {
        awaiting_search_consent: 'true',
        pending_search_query: input.message
      }, []);
      const searchType = 'flight and airline information';
      return {
        reply: `I can search the web to find current ${searchType}. Would you like me to do that?`,
        citations: undefined,
      };
    }
  }
  
  if (input.route.intent === 'weather') {
    if (!cityHint) {
      return { reply: 'Which city?', citations: undefined };
    }
  }
  if (input.route.intent === 'packing') {
    if (!cityHint) {
      return { reply: 'Which city?', citations: undefined };
    }
    // Ask for dates if no time context and no immediate context
    const hasImmediateContext = /\b(today|now|currently|right now|what to wear)\b/i.test(input.message);
    if (!whenHint && !hasImmediateContext && !/\b(kids?|children|family|business|work|summer|winter|spring|fall)\b/i.test(input.message)) {
      return { reply: 'Which month or travel dates?', citations: undefined };
    }
  }
  if (input.route.intent === 'destinations') {
    if (!cityHint) {
      return { reply: 'Which city?', citations: undefined };
    }
    if (!whenHint) {
      return { reply: 'Which month or travel dates?', citations: undefined };
    }
  }
  if (input.route.intent === 'attractions' && !cityHint) {
    return { reply: 'What city are you interested in?', citations: undefined };
  }
  
  const cits: string[] = [];
  let facts = '';
  const factsArr: Fact[] = [];
  const decisions: string[] = [];
  try {
    if (input.route.intent === 'weather') {
      ctx.onStatus?.('Checking weather data...');
      const wx = await getWeather({
        city: cityHint,
        datesOrMonth: whenHint || 'today',
      });
      if (wx.ok) {
        const source = wx.source === getSearchSource() ? getSearchCitation() : 'Open-Meteo';
        // Use deterministic composer for weather
        const reply = composeWeatherReply(cityHint, whenHint || 'today', wx.summary, source);
        
        // Store facts for receipts
        if (input.threadId) {
          const factsArr: Fact[] = [{ source, key: 'weather_summary', value: wx.summary }];
          const decisions = ['Used weather API because user asked about weather.'];
          setLastReceipts(input.threadId, factsArr, decisions, reply);
        }
        
        return { reply, citations: [source] };
      } else {
        ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
        if (wx.reason === 'unknown_city') {
          return { 
            reply: `I couldn't find weather data for "${cityHint}". Could you provide a valid city name?`, 
            citations: undefined 
          };
        }
      }
    } else if (input.route.intent === 'packing') {
      ctx.onStatus?.('Preparing packing recommendations...');
      const wx = await getWeather({
        city: cityHint,
        datesOrMonth: whenHint || 'today',
      });
      if (wx.ok) {
        const source = wx.source === getSearchSource() ? getSearchCitation() : 'Open-Meteo';
        
        // Get packing items based on weather
        await loadPackingOnce();
        const temps = parseTemps(wx.summary);
        const band = chooseBandFromTemps(temps?.maxC, temps?.minC);
        const items = band ? PACKING[band] : [];
        
        // Use deterministic composer for packing
        const reply = composePackingReply(cityHint, whenHint, wx.summary, items, source);
        
        // Store facts for receipts
        if (input.threadId) {
          const factsArr: Fact[] = [
            { source, key: 'weather_summary', value: wx.summary },
            { source, key: 'packing_items', value: items }
          ];
          const decisions = ['Used weather to tailor packing items.'];
          setLastReceipts(input.threadId, factsArr, decisions, reply);
        }
        
        return { reply, citations: [source] };
      } else {
        ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
        // For packing, proceed with general guidance even if city lookup fails
      }
    } else if (input.route.intent === 'destinations') {
      // Check if this is a refinement of existing context
      const isRefinement = /\b(make it|kid[- ]?friendly|family|children|kids?)\b/i.test(input.message);
      const hasExistingContext = cityHint && whenHint;
      
      if (isRefinement && hasExistingContext) {
        // For refinements, use the existing context and add refinement guidance
        ctx.onStatus?.('Refining your travel recommendations...');
        ctx.log.debug({ intent: input.route.intent, slots: input.route.slots, isRefinement: true }, 'destinations_refinement_detected');
        
        // Add context-specific facts for the existing destination
        const contextFact = `EXISTING CONTEXT: Traveling from ${cityHint} in ${whenHint}. User requested refinement: ${input.message}`;
        facts += `${contextFact}\n`;
        decisions.push('Detected refinement request - preserving existing travel context and adding specific adjustments.');
      } else {
        // Use destinations catalog for new recommendations
        ctx.onStatus?.('Finding destinations...');
        ctx.log.debug({ intent: input.route.intent, slots: input.route.slots }, 'destinations_block_entered');
        try {
          const { recommendDestinations } = await import('../tools/destinations.js');
          ctx.log.debug('destinations_function_imported');
          const destinationFacts = await recommendDestinations(input.route.slots);
          ctx.log.debug({ factsCount: destinationFacts.length }, 'destinations_function_called');
        
        if (destinationFacts.length > 0) {
          cits.push('Catalog+REST Countries');
          const destinations = destinationFacts.map(f => 
            `${f.value.city}, ${f.value.country} (${f.value.tags.climate}, ${f.value.tags.budget} budget, family-friendly: ${f.value.tags.family_friendly ? 'yes' : 'no'})`
          ).join('; ');
          facts += `DESTINATION OPTIONS: ${destinations}\n`;
          factsArr.push(...destinationFacts);
          decisions.push('Filtered destinations catalog by month/profile with factual anchors.');
          ctx.log.debug({ destinationCount: destinationFacts.length, destinations }, 'destinations_facts_added');
        }
      } catch (e) {
        ctx.log.debug({ error: e }, 'destinations_catalog_failed');
        decisions.push('Destinations catalog unavailable; using generic guidance.');
      }
      }
      
      // Get weather for origin city (use originCity if available, fallback to city)
      const originCity = input.route.slots.originCity || cityHint;
      if (originCity) {
        const wx = await getWeather({
          city: originCity,
          datesOrMonth: whenHint || 'today',
        });
        if (wx.ok) {
          const source =
            wx.source === getSearchSource() ? getSearchCitation() : 'Open-Meteo';
          cits.push(source);
          facts += `Weather for ${originCity}: ${wx.summary} (${source})\n`;
          factsArr.push({ source, key: 'weather_summary', value: wx.summary });
          decisions.push('Considered origin weather/season for destination suggestions.');
        } else {
          ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
          // Handle unknown city specifically
          if (wx.reason === 'unknown_city') {
            return { 
              reply: `I couldn't find weather data for "${originCity}". Could you provide a valid city name?`, 
              citations: undefined 
            };
          }
        }
        
        // Check if this is a country information query
        const isCountryQuery = /tell me about.*(?:country|spain|france|italy|germany|japan|canada|australia|brazil|mexico|india|china|russia|uk|usa|america)/i.test(input.message) || 
                              /(?:spain|france|italy|germany|japan|canada|australia|brazil|mexico|india|china|russia).*(?:country|as a country)/i.test(input.message);
        
        let countryTarget = originCity;
        if (isCountryQuery) {
          // Extract country name from the message
          const countryMatch = input.message.match(/(?:tell me about|about)\s+([a-z\s]+?)(?:\s+(?:as a|country)|$)/i);
          if (countryMatch && countryMatch[1]) {
            countryTarget = countryMatch[1].trim();
          }
        }
        
        const cf = await getCountryFacts({ 
          city: isCountryQuery ? undefined : originCity,
          country: isCountryQuery ? countryTarget : undefined 
        });
        if (cf.ok) {
          const source =
            cf.source === getSearchSource()
              ? getSearchCitation()
              : 'REST Countries';
          cits.push(source);
          facts += `Country: ${cf.summary} (${source})\n`;
          factsArr.push({ source, key: 'country_summary', value: cf.summary });
          decisions.push('Added country context (currency, language, region).');
        } else {
          ctx.log.debug({ reason: cf.reason }, 'country_adapter_failed');
        }
      }
    } else if (input.route.intent === 'attractions') {
      // Prefer OpenTripMap results; avoid listing specific POIs from generic web search
      ctx.onStatus?.('Searching for attractions...');
      const wantsKid = /\b(kids?|children|child|3\s*-?\s*year|toddler|stroller|pram|family)\b/i.test(input.message);
      const at = await getAttractions({ city: cityHint, limit: 5, profile: wantsKid ? 'kid_friendly' : 'default' });
      if (at.ok && (at.source === 'opentripmap' || at.source === getSearchSource())) {
        const source = at.source === 'opentripmap' ? 'OpenTripMap' : getSearchCitation();
        
        // Use deterministic composer for attractions
        const attractions = at.summary.split(/;\s*/).map(s => s.trim()).filter(Boolean).slice(0, 5);
        const reply = composeAttractionsReply(cityHint || 'the area', attractions, source);
        
        // Store facts for receipts
        if (input.threadId) {
          const factsArr: Fact[] = [{ source, key: 'poi_list', value: at.summary }];
          const decisions = [wantsKid ? 'Listed kid-friendly attractions from travel APIs.' : 'Listed top attractions from travel APIs.'];
          setLastReceipts(input.threadId, factsArr, decisions, reply);
        }
        
        return { reply, citations: [source] };
      } else if (!at.ok && at.reason === 'unknown_city') {
        return {
          reply: `I'm unable to retrieve current attraction data for ${cityHint} right now. You might want to check local tourism websites or travel guides for the most up-to-date information about popular attractions, museums, and points of interest in the area.`,
          citations: undefined
        };
      }
    }
  } catch (e) {
    ctx.log.warn({ err: e }, 'facts retrieval failed');
    decisions.push('Facts retrieval encountered an error; kept response generic.');
  }
  
  ctx.onStatus?.('Preparing your response...');
  
  // For complex cases that need narrative generation, use batched LLM
  if (plan.style === 'narrative' || input.route.intent === 'destinations') {
    const systemMd = await getPrompt('system');
    const blendMd = await getPrompt('blend');
    const cotMd = await getPrompt('cot');
    
    // Include available slot context even when external APIs fail
    let contextInfo = '';
    if (cityHint && facts.trim() === '') {
      contextInfo = `Available context: City is ${cityHint}\n`;
    }

    const factsText = (contextInfo + facts) || '(none)';
    const cotPrompt = `${systemMd}\n\n${cotMd}\n\nAnalyze:\nSlots: ${JSON.stringify(input.route.slots)}\nFacts:\n${factsText}\nUser: ${input.message}`;
    const finalPrompt = `${systemMd}\n\n${
      blendMd?.includes('{{FACTS}}')
        ? blendMd.replace('{{FACTS}}', factsText).replace('{{USER}}', input.message)
        : `Facts:\n${factsText}\nUser: ${input.message}`
    }`;

    try {
      const [cotAnalysis, rawReply] = await callLLMBatch([cotPrompt, finalPrompt], { log: ctx.log });
      
      // Check if CoT suggests missing critical information
      if (cotAnalysis && cotAnalysis.includes('missing') && (cotAnalysis.includes('city') || cotAnalysis.includes('date'))) {
        const missingSlots = [];
        if (cotAnalysis.includes('missing') && cotAnalysis.includes('city') && !cityHint) {
          missingSlots.push('city');
        }
        if (cotAnalysis.includes('missing') && (cotAnalysis.includes('date') || cotAnalysis.includes('month')) && !whenHint) {
          missingSlots.push('dates');
        }
        
        if (missingSlots.length > 0) {
          const missing = missingSlots[0];
          if (missing === 'city') {
            return { reply: "Which city are you interested in?", citations: undefined };
          }
          if (missing === 'dates') {
            return { reply: "When are you planning to travel?", citations: undefined };
          }
        }
      }
      
      // Decode HTML entities from LLM response
      let reply = (rawReply || '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
        
      // Add mixed language warning if detected
      if (plan.mixed_languages) {
        reply = `Note: I work best with English, but I'll try to help. ${reply}`;
      }
      
      // Ensure a human-readable source mention appears once when external facts were used
      let replyWithSource = reply;
      if (cits.length > 0 && cits[0]) {
        const firstSource = cits[0] as string;
        const alreadyMentionsSource = new RegExp(`\\b${firstSource.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(replyWithSource);
        if (!alreadyMentionsSource) {
          replyWithSource = `${replyWithSource} (${firstSource})`;
        }
      }

      // Persist receipts components for this thread
      if (input.threadId && factsArr.length > 0) {
        try {
          setLastReceipts(input.threadId, factsArr, decisions, replyWithSource);
        } catch {
          // ignore
        }
      }
      
      // Validate citations
      try {
        validateNoCitation(replyWithSource, cits.length > 0);
      } catch (err) {
        ctx.log.warn({ reply: replyWithSource, cits, hasExternal: cits.length > 0 }, 'citation_validation_failed');
      }
      
      return { reply: replyWithSource, citations: cits.length ? cits : undefined };
      
    } catch (e) {
      ctx.log.debug({ error: e }, 'Batched LLM generation failed');
      return {
        reply: 'I encountered an issue processing your request. Could you try rephrasing your question?',
        citations: undefined,
      };
    }
  }
  
  // Fallback for any remaining cases
  return {
    reply: 'Could you provide more details about what you\'re looking for?',
    citations: undefined,
  };
}

function extractCity(text: string): string | undefined {
  const m = text.match(/\b(?:in|to)\s+([A-Z][A-Za-z\- ]+(?:\s+[A-Z][A-Za-z\- ]+)*)/);
  const captured = m && m[1] ? m[1] : undefined;
  if (!captured) return undefined;
  const first = captured.split(/[.,!?]/)[0] || '';
  const out = first.trim();
  return out.length > 0 ? out : undefined;
}

function extractMonthOrDates(text: string): string | undefined {
  const m =
    text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\b/i) ??
    text.match(/\d{4}-\d{2}-\d{2}\s*\.\.\s*\d{4}-\d{2}-\d{2}/);
  return m?.[0];
}

function parseTemps(
  summary: string,
): { maxC: number; minC: number } | undefined {
  const m = summary.match(
    /High\s+(-?\d+(?:\.\d+)?)°C\s*\/\s*Low\s+(-?\d+(?:\.\d+)?)°C/i,
  );
  if (!m) return undefined;
  const maxC = Number(m[1]);
  const minC = Number(m[2]);
  return { maxC, minC };
}

function chooseBandFromTemps(
  maxC?: number,
  minC?: number,
): keyof PackingData | undefined {
  if (typeof maxC === 'number' && maxC >= 26) return 'hot';
  if (typeof minC === 'number' && minC <= 5) return 'cold';
  if (typeof maxC === 'number' || typeof minC === 'number') return 'mild';
  return undefined;
}
