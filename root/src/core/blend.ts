import type pino from 'pino';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ChatInputT, ChatOutput } from '../schemas/chat.js';
import { getThreadId, pushMessage } from './memory.js';
import { runGraphTurn } from './graph.js';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import { getWeather } from '../tools/weather.js';
import { getCountryFacts } from '../tools/country.js';
import { getAttractions } from '../tools/attractions.js';
import { validateNoCitation } from './citations.js';
import type { Fact } from './receipts.js';
import { getLastReceipts, setLastReceipts } from './slot_memory.js';
import { buildReceiptsSkeleton, ReceiptsSchema } from './receipts.js';
import { verifyAnswer } from './verify.js';

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
      return ChatOutput.parse({ reply, threadId, sources: receipts.sources, receipts: safe });
    } catch {
      return ChatOutput.parse({ reply, threadId, sources: receipts.sources });
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
  // Detect mixed languages at the top level for use throughout the function
  const hasMixedLanguages = /[а-яё]/i.test(input.message) || /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(input.message);
  
  // Targeted clarifications for underspecified inputs per ticket 02
  const cityHint = input.route.slots.city && input.route.slots.city.trim();
  const whenHint = (input.route.slots.dates && input.route.slots.dates.trim()) || 
                   (input.route.slots.month && input.route.slots.month.trim());
                   
  if (input.route.intent === 'unknown') {
    // Detect completely unrelated questions
    const unrelatedPatterns = [
      /meaning of life|universe|god|religion|politics|philosophy/i,
      /react|javascript|programming|code|software|algorithm|development/i,
      /medicine|medical|doctor|health|disease|treatment|headache/i,
      /cook|recipe|food|restaurant|eat|drink|ingredient/i,
      /^[^a-zA-Zа-яА-Я]*$/  // Non-alphabetic gibberish
    ];

    // Handle system/meta questions
    const systemPatterns = [
      /who are you|what are you|are you real|are you human|ai assistant/i,
      /help me with|can you do|what can you|how do you work/i,
      /explain yourself|what do you mean/i
    ];

    // Handle edge cases
    const isEmptyOrWhitespace = input.message.trim().length === 0;
    const isEmojiOnly = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\s]*$/u.test(input.message) && input.message.trim().length > 0;
    const isGibberish = /^[a-z]{10,}$/i.test(input.message.replace(/\s/g, '')) && !/\b(weather|pack|travel|city|go|visit|attraction|destination|trip|flight|hotel)\b/i.test(input.message);
    const isVeryLong = input.message.length > 500;
    const hasLongCityName = /\b\w{30,}\b/.test(input.message);
    const isSystemQuestion = systemPatterns.some(pattern => pattern.test(input.message));
    const isUnrelated = unrelatedPatterns.some(pattern => pattern.test(input.message)) ||
      input.message.length < 3 ||
      input.route.confidence <= 0.4;

    ctx.log.debug({
      message: input.message,
      intent: input.route.intent,
      confidence: input.route.confidence,
      isUnrelated,
      isSystemQuestion,
      isEmptyOrWhitespace,
      isEmojiOnly,
      isGibberish,
      isVeryLong,
      hasLongCityName,
      hasMixedLanguages
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

    if (isVeryLong) {
      // Extract key travel elements from long messages
      const hasTravel = /\b(trip|travel|visit|go|pack|weather|destination|city|country|flight|hotel)\b/i.test(input.message);
      if (hasTravel) {
        return {
          reply: 'I see you\'re planning a trip! To help you better, could you ask me a specific question about weather, destinations, packing, or attractions?',
          citations: undefined,
        };
      }
    }

    if (isSystemQuestion) {
      return {
        reply: 'I\'m an AI travel assistant designed to help with weather, destinations, packing advice, and attractions. How can I help with your travel planning?',
        citations: undefined,
      };
    }

    if (isUnrelated) {
      ctx.log.debug({ message: input.message }, 'blend_unrelated_detected');
      return {
        reply: 'I\'m a travel assistant focused on helping with weather, destinations, packing, and attractions. Could you ask me something about travel planning?',
        citations: undefined,
      };
    }

    return {
      reply: 'Could you share the city and month/dates?',
      citations: undefined,
    };
  }
  if (input.route.intent === 'weather') {
    if (!cityHint) {
      return { reply: 'Which city?', citations: undefined };
    }
    // Weather queries don't need dates - use current weather
  }
  if (input.route.intent === 'packing') {
    if (!cityHint) {
      return { reply: 'Which city?', citations: undefined };
    }
    // Ask for dates if no time context and no special circumstances mentioned
    // But default to today for immediate queries like "what to wear"
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
        const source = at.source === 'brave-search' ? 'Brave Search' : at.source === 'opentripmap' ? 'OpenTripMap' : 'Wikipedia';
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
        const source = at.source === 'brave-search' ? 'Brave Search' : at.source === 'opentripmap' ? 'OpenTripMap' : 'Wikipedia';
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
  const reply = await callLLM(prompt, { log: ctx.log });
  // Enforce no fabricated citations when no external facts were used
  try {
    validateNoCitation(reply, cits.length > 0);
  } catch (err) {
    ctx.log.warn({ reply, cits, hasExternal: cits.length > 0 }, 'citation_validation_failed');
    // Don't throw - just log and continue with the response
  }
  // Persist receipts components for this thread (if available)
  if (input.threadId) {
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


