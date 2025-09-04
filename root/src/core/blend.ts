import type pino from 'pino';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ChatInputT, ChatOutput } from '../schemas/chat.js';
import { getThreadId, pushMessage } from './memory.js';
import { runGraphTurn } from './graph.js';
import { callLLM, classifyContent, optimizeSearchQuery } from './llm.js';
import { getPrompt } from './prompts.js';
import { getWeather } from '../tools/weather.js';
import { getCountryFacts } from '../tools/country.js';
import { getAttractions } from '../tools/attractions.js';
import { searchTravelInfo } from '../tools/brave_search.js';
import { validateNoCitation } from './citations.js';
import type { Fact } from './receipts.js';
import { getLastReceipts, setLastReceipts, updateThreadSlots } from './slot_memory.js';
import { buildReceiptsSkeleton, ReceiptsSchema } from './receipts.js';
import { verifyAnswer } from './verify.js';

async function decideShouldSearch(
  message: string,
  ctx: { log: pino.Logger },
): Promise<boolean> {
  const promptTemplate = await getPrompt('web_search_decider');
  const prompt = promptTemplate.replace('{message}', message);

  try {
    const response = await callLLM(prompt, { log: ctx.log });
    return response.toLowerCase().includes('yes');
  } catch {
    return false;
  }
}

async function detectQueryType(
  message: string,
  ctx: { log: pino.Logger },
): Promise<'restaurant' | 'budget' | 'flight' | 'none'> {
  const promptTemplate = await getPrompt('query_type_detector');
  const prompt = promptTemplate.replace('{message}', message);

  try {
    const response = await callLLM(prompt, { log: ctx.log });
    const type = response.toLowerCase().trim();
    if (['restaurant', 'budget', 'flight'].includes(type)) {
      return type as 'restaurant' | 'budget' | 'flight';
    }
    return 'none';
  } catch {
    return 'none';
  }
}

async function summarizeSearch(
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
    if (sanitized.length > 400) {
      const sentences = sanitized.split(/[.!?]+/);
      let truncated = '';
      for (const sentence of sentences) {
        if ((truncated + sentence).length > 380) break;
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
async function performWebSearch(
  query: string,
  ctx: { log: pino.Logger },
  threadId?: string,
): Promise<{ reply: string; citations?: string[] }> {
  ctx.log.debug({ query }, 'performing_web_search');
  
  const searchResult = await searchTravelInfo(query, ctx.log);
  
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
  
  // Use summarization for better results
  const { reply, citations } = await summarizeSearch(searchResult.results, query, ctx);
  
  // Store search facts for receipts
  if (threadId) {
    try {
      const facts: Fact[] = searchResult.results.slice(0, 3).map((result, index) => ({
        source: 'Brave Search',
        key: `search_result_${index}`,
        value: `${result.title}: ${result.description}`,
      }));
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
  ctx: { log: pino.Logger },
) {
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
      const receiptsReply = `--- RECEIPTS ---\n\nSources: ${receipts.sources.join(', ')}\n\nDecisions: ${decisions.join(' ')}\n\nSelf-Check: ${audit.verdict}${audit.notes.length > 0 ? ` (${audit.notes.join(', ')})` : ''}\n\nBudget: ${receipts.budgets.ext_api_latency_ms || 0}ms API, ~${token_estimate} tokens`;
      
      return ChatOutput.parse({ reply: receiptsReply, threadId, sources: receipts.sources, receipts: safe });
    } catch {
      const receiptsReply = `--- RECEIPTS ---\n\nSources: ${receipts.sources.join(', ')}\n\nDecisions: ${decisions.join(' ')}\n\nSelf-Check: not available\n\nBudget: ${receipts.budgets.ext_api_latency_ms || 0}ms API, ~${token_estimate} tokens`;
      return ChatOutput.parse({ reply: receiptsReply, threadId, sources: receipts.sources });
    }
  }
  pushMessage(threadId, { role: 'user', content: input.message });
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
  ctx: { log: pino.Logger },
) {
  // Use LLM for mixed language detection with fallback
  let hasMixedLanguages = false;
  try {
    const contentClassification = await classifyContent(input.message, ctx.log);
    hasMixedLanguages = contentClassification?.has_mixed_languages || false;
  } catch {
    // Fallback to regex detection
    hasMixedLanguages = /[а-яё]/i.test(input.message) || /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(input.message);
  }
  
  // Trust the slot extraction - if LLM found a city, use it
  // Only ask for clarification if no city was extracted at all
  const cityHint = input.route.slots.city && input.route.slots.city.trim();
  const whenHint = (input.route.slots.dates && input.route.slots.dates.trim()) || 
                   (input.route.slots.month && input.route.slots.month.trim());
                   
  if (input.route.intent === 'unknown') {
    // Use LLM for explicit search detection with fallback
    let isExplicitSearch = false;
    try {
      const contentClassification = await classifyContent(input.message, ctx.log);
      isExplicitSearch = contentClassification?.is_explicit_search || false;
    } catch {
      // Fallback to regex patterns
      isExplicitSearch = /search|google/i.test(input.message);
    }
    
    if (isExplicitSearch) {
      let searchQuery = input.message.replace(/^(search|google)\s+(web|online|for)?\s*/i, '').trim();
      if (!searchQuery) searchQuery = input.message;
      
      // Optimize the search query
      const optimizedQuery = await optimizeSearchQuery(
        searchQuery,
        input.route.slots,
        'web_search',
        ctx.log
      );
      
      return await performWebSearch(optimizedQuery, ctx, input.threadId);
    }

    // Use LLM to decide if this needs web search
    const shouldSearch = await decideShouldSearch(input.message, ctx);
    if (shouldSearch) {
      // Optimize the search query
      const optimizedQuery = await optimizeSearchQuery(
        input.message,
        input.route.slots,
        input.route.intent,
        ctx.log
      );
      
      return await performWebSearch(optimizedQuery, ctx, input.threadId);
    }

    // Use LLM for unrelated content detection with fallback
    let isUnrelated = false;
    try {
      const contentClassification = await classifyContent(input.message, ctx.log);
      isUnrelated = contentClassification?.content_type === 'unrelated';
    } catch {
      // Fallback to simple patterns
      isUnrelated = /programming|code|javascript|react|cook|pasta|medicine|doctor/i.test(input.message);
    }

    if (isUnrelated) {
      return {
        reply: "I'm a travel assistant focused on helping with weather, destinations, packing, and attractions. Could you ask me something about travel planning?",
        citations: undefined,
      };
    }

    // Use LLM for system question detection with fallback
    let isSystemQuestion = false;
    try {
      const contentClassification = await classifyContent(input.message, ctx.log);
      isSystemQuestion = contentClassification?.content_type === 'system';
    } catch {
      // Fallback to regex patterns
      const systemPatterns = [
        /who are you|what are you|are you real|are you human|ai assistant/i,
        /help me with|can you do|what can you|how do you work/i,
        /explain yourself|what do you mean/i
      ];
      isSystemQuestion = systemPatterns.some(pattern => pattern.test(input.message));
    }

    // Use LLM for edge case detection with fallbacks
    let isEmptyOrWhitespace = input.message.trim().length === 0;
    let isEmojiOnly = false;
    let isGibberish = false;
    let isVeryLong = input.message.length > 500;
    let hasLongCityName = /\b\w{30,}\b/.test(input.message);
    
    try {
      const contentClassification = await classifyContent(input.message, ctx.log);
      isEmojiOnly = contentClassification?.content_type === 'emoji_only';
      isGibberish = contentClassification?.content_type === 'gibberish';
    } catch {
      // Fallback to regex patterns
      isEmojiOnly = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\s]*$/u.test(input.message) && input.message.trim().length > 0;
      isGibberish = /^[a-z]{10,}$/i.test(input.message.replace(/\s/g, '')) && !/\b(weather|pack|travel|city|go|visit|attraction|destination|trip|flight|hotel)\b/i.test(input.message);
    }

    ctx.log.debug({
      message: input.message,
      intent: input.route.intent,
      confidence: input.route.confidence
    }, 'blend_unknown_intent');

    if (isEmptyOrWhitespace) {
      return {
        reply: 'I need more information to help you. Could you ask me something about travel planning?',
        citations: undefined,
      };
    }

    if (isEmojiOnly) {
      return {
        reply: 'I can\'t interpret emoji-only messages. Could you ask me something about travel planning in words?',
        citations: undefined,
      };
    }

    if (hasLongCityName) {
      return {
        reply: 'I notice you mentioned a very long city name. Could you provide a standard city name for me to help with your travel planning?',
        citations: undefined,
      };
    }

    if (hasMixedLanguages) {
      // Continue with normal processing but add warning prefix later
      ctx.log.debug({ message: input.message }, 'mixed_language_detected');
    }

    if (isVeryLong) {
      return {
        reply: 'That\'s quite a detailed message! Could you ask me a specific question about weather, packing, destinations, or attractions to help with your travel planning?',
        citations: undefined,
      };
    }

    if (isGibberish) {
      return {
        reply: 'I don\'t understand that input. Could you ask me a clear question about travel planning?',
        citations: undefined,
      };
    }

    if (isSystemQuestion) {
      return {
        reply: 'I\'m an AI travel assistant designed to help with weather, destinations, packing advice, and attractions. How can I help with your travel planning?',
        citations: undefined,
      };
    }

    return {
      reply: 'Could you share the city and month/dates?',
      citations: undefined,
    };
  }
  
  // Check for restaurant/food queries in attractions intent
  if (input.route.intent === 'attractions') {
    const queryType = await detectQueryType(input.message, ctx);
    
    if ((queryType === 'restaurant' || queryType === 'budget') && input.threadId) {
      // Store the pending search query and set consent state
      updateThreadSlots(input.threadId, {
        awaiting_search_consent: 'true',
        pending_search_query: input.message
      }, []);
      
      const searchType = queryType === 'restaurant' ? 'restaurant recommendations' : 'cost and budget information';
      return {
        reply: `I can search the web to find current ${searchType}. Would you like me to do that?`,
        citations: undefined,
      };
    }
  }
  
  // Check for queries that need web search in destinations/packing intents
  if (input.route.intent === 'destinations' || input.route.intent === 'packing') {
    const shouldSearch = await decideShouldSearch(input.message, ctx);
    if (shouldSearch) {
      return await performWebSearch(input.message, ctx, input.threadId);
    }
  }

  // Check for budget/cost queries in destinations intent
  if (input.route.intent === 'destinations') {
    const budgetPatterns = [
      /budget|cost|price|money|expensive|cheap|afford|spend/i,
      /how\s+much/i,
      /exchange\s+rate|currency/i
    ];
    
    const queryType = await detectQueryType(input.message, ctx);
    
    if ((queryType === 'budget' || queryType === 'flight') && input.threadId) {
      // Store the pending search query and set consent state
      updateThreadSlots(input.threadId, {
        awaiting_search_consent: 'true',
        pending_search_query: input.message
      }, []);
      
      const searchType = queryType === 'budget' ? 'cost and budget information' : 'flight and airline information';
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
      const wx = await getWeather({
        city: cityHint,
        datesOrMonth: whenHint || 'today',
      });
      if (wx.ok) {
        const source = wx.source === 'brave-search' ? 'Brave Search' : 'Open-Meteo';
        cits.push(source);
        ctx.log.debug({ wxSource: wx.source, source, citsLength: cits.length }, 'weather_citation_added');
        facts += `Weather: ${wx.summary}\n`;
        factsArr.push({ source, key: 'weather_summary', value: wx.summary });
        decisions.push('Used weather API because user asked about weather or it informs packing.');
      } else {
        ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
        // Handle unknown city specifically
        if (wx.reason === 'unknown_city') {
          return { 
            reply: `I couldn't find weather data for "${cityHint}". Could you provide a valid city name?`, 
            citations: undefined 
          };
        }
        decisions.push('Weather API unavailable; avoided numbers and provided generic guidance.');
      }
    } else if (input.route.intent === 'packing') {
      const wx = await getWeather({
        city: cityHint,
        datesOrMonth: whenHint || 'today',
      });
      if (wx.ok) {
        const source = wx.source === 'brave-search' ? 'Brave Search' : 'Open-Meteo';
        cits.push(source);
        facts += `Weather: ${wx.summary}\n`;
        factsArr.push({ source, key: 'weather_summary', value: wx.summary });
        decisions.push('Used weather to tailor packing items.');
        // Packing suggestions based on weather
        await loadPackingOnce();
        const temps = parseTemps(wx.summary);
        const band = chooseBandFromTemps(temps?.maxC, temps?.minC);
        const items = band ? PACKING[band] : [];
        if (items && items.length > 0) {
          facts += `Packing: ${items.join(', ')}\n`;
          factsArr.push({ source, key: 'packing_items', value: items });
        }
      } else {
        ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
        // Handle unknown city specifically
        if (wx.reason === 'unknown_city') {
          return { 
            reply: `I couldn't find weather data for "${cityHint}". Could you provide a valid city name?`, 
            citations: undefined 
          };
        }
        decisions.push('Weather API unavailable; offered general packing guidance without numbers.');
      }
    } else if (input.route.intent === 'destinations') {
      const wx = await getWeather({
        city: cityHint,
        datesOrMonth: whenHint || 'today',
      });
      if (wx.ok) {
        const source = wx.source === 'brave-search' ? 'Brave Search' : 'Open-Meteo';
        cits.push(source);
        facts += `Weather: ${wx.summary}\n`;
        factsArr.push({ source, key: 'weather_summary', value: wx.summary });
        decisions.push('Considered origin weather/season for destination suggestions.');
      } else {
        ctx.log.debug({ reason: wx.reason }, 'weather_adapter_failed');
        // Handle unknown city specifically
        if (wx.reason === 'unknown_city') {
          return { 
            reply: `I couldn't find weather data for "${cityHint}". Could you provide a valid city name?`, 
            citations: undefined 
          };
        }
      }
      const cf = await getCountryFacts({ city: cityHint });
      if (cf.ok) {
        const source = cf.source === 'brave-search' ? 'Brave Search' : 'REST Countries';
        cits.push(source);
        facts += `Country: ${cf.summary}\n`;
        factsArr.push({ source, key: 'country_summary', value: cf.summary });
        decisions.push('Added country context (currency, language, region).');
      } else {
        ctx.log.debug({ reason: cf.reason }, 'country_adapter_failed');
      }
      const at = await getAttractions({ city: cityHint, limit: 5 });
      if (at.ok) {
        const source = at.source === 'brave-search' ? 'Brave Search' : 'OpenTripMap';
        cits.push(source);
        facts += `POIs: ${at.summary}\n`;
        factsArr.push({ source: source, key: 'poi_list', value: at.summary });
        decisions.push('Listed top attractions from external POI API.');
      } else {
        ctx.log.debug({ reason: at.reason }, 'attractions_adapter_failed');
        decisions.push('Attractions lookup failed; avoided fabricating POIs.');
      }
    } else if (input.route.intent === 'attractions') {
      const at = await getAttractions({ city: cityHint, limit: 5 });
      if (at.ok) {
        const source = at.source === 'brave-search' ? 'Brave Search' : 'OpenTripMap';
        cits.push(source);
        facts += `POIs: ${at.summary}\n`;
        factsArr.push({ source: source, key: 'poi_list', value: at.summary });
        decisions.push('Listed top attractions from external POI API.');
      } else {
        ctx.log.debug({ reason: at.reason }, 'attractions_adapter_failed');
        decisions.push('Attractions lookup failed; avoided fabricating POIs.');
      }
    }
  } catch (e) {
    ctx.log.warn({ err: e }, 'facts retrieval failed');
    decisions.push('Facts retrieval encountered an error; kept response generic.');
  }
  const systemMd = await getPrompt('system');
  const blendMd = await getPrompt('blend');
  
  // Include available slot context even when external APIs fail
  let contextInfo = '';
  if (cityHint && facts.trim() === '') {
    // For attractions queries with no facts, explicitly indicate API failure
    if (input.route.intent === 'attractions') {
      contextInfo = `API Status: Attractions data unavailable for ${cityHint}\n`;
    } else {
      contextInfo = `Available context: City is ${cityHint}\n`;
    }
  }
  
  const tmpl = blendMd && blendMd.includes('{{FACTS}}')
    ? blendMd
        .replace('{{FACTS}}', (contextInfo + facts) || '(none)')
        .replace('{{USER}}', input.message)
    : `Facts (may be empty):\n${contextInfo + facts}\nUser: ${input.message}`;
  const prompt = `${systemMd}\n\n${tmpl}`.trim();
  const rawReply = await callLLM(prompt, { log: ctx.log });
  
  // Decode HTML entities from LLM response
  const reply = rawReply
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  // Enforce no fabricated citations when no external facts were used
  try {
    validateNoCitation(reply, cits.length > 0);
  } catch (err) {
    ctx.log.warn({ reply, cits, hasExternal: cits.length > 0 }, 'citation_validation_failed');
    // Don't throw - just log and continue with the response
  }
  // Persist receipts components for this thread (only if external facts were actually retrieved)
  if (input.threadId && factsArr.length > 0) {
    try {
      setLastReceipts(input.threadId, factsArr, decisions, reply);
    } catch {
      // ignore
    }
  }
  
  // Add mixed language warning if detected
  const finalReply = hasMixedLanguages 
    ? `Note: I work best with English, but I'll try to help. ${reply}`
    : reply;
    
  return { reply: finalReply, citations: cits.length ? cits : undefined };
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


