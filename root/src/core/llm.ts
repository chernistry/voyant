import 'dotenv/config';
import { getContext } from './memory.js';
import { fetch as undiciFetch } from 'undici';
import { getPrompt } from './prompts.js';

type ResponseFormat = 'text' | 'json';

// NLP service types
export type ContentClassification = {
  content_type: 'travel' | 'system' | 'unrelated' | 'budget' | 'restaurant' | 'flight' | 'gibberish' | 'emoji_only';
  is_explicit_search: boolean;
  has_mixed_languages: boolean;
  needs_web_search: boolean;
};

export type IntentClassification = {
  intent: 'weather' | 'packing' | 'attractions' | 'destinations' | 'web_search' | 'unknown';
  confidence: number;
  needExternal: boolean;
};

// Simple token counter (approximate)
function countTokens(text: string): number {
  return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 characters
}

export async function callLLM(
  prompt: string,
  _opts: { responseFormat?: ResponseFormat; log?: any } = {},
): Promise<string> {
  const jsonHint = /strict JSON|Return strict JSON|Output \(strict JSON only\)/i.test(prompt);
  const format: ResponseFormat = _opts.responseFormat ?? (jsonHint ? 'json' : 'text');
  const log = _opts.log;

  const inputTokens = countTokens(prompt);
  if (log) log.debug(`🤖 LLM Call - Input: ${inputTokens} tokens, Format: ${format}`);
  
  // Try configured provider first
  const baseUrl = process.env.LLM_PROVIDER_BASEURL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? 'mistralai/mistral-nemo';

  if (baseUrl && apiKey) {
    try {
      if (log) log.debug(`🔗 Using configured provider: ${baseUrl} with model: ${model}`);
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await undiciFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: format === 'json' ? 0.2 : 0.5,
          max_tokens: 2000, // Increased from 800
          response_format: format === 'json' ? { type: 'json_object' } : undefined,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`❌ LLM API error: ${res.status} - ${errorText}`);
        return stubSynthesize(prompt);
      }
      const data = (await res.json()) as { 
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage;
      
      if (log) log.debug(`✅ LLM Response - Output: ${countTokens(content)} tokens (approx)`);
      if (usage && log) {
        log.debug(`📊 Token usage - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Total: ${usage.total_tokens}`);
      }
      if (log) log.debug(`📝 Full response: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
      
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
      }
      console.warn('⚠️ Empty response from LLM, using stub');
      return stubSynthesize(prompt);
    } catch (error) {
      console.warn('❌ LLM API failed, using stub:', error);
      return stubSynthesize(prompt);
    }
  }

  // Fallback to OpenRouter if available
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    try {
      if (log) log.debug('🔗 Using OpenRouter fallback with model: tngtech/deepseek-r1t2-chimera:free');
      const res = await undiciFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: 'tngtech/deepseek-r1t2-chimera:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: format === 'json' ? 0.2 : 0.5,
          max_tokens: 2000, // Increased from 800
          response_format: format === 'json' ? { type: 'json_object' } : undefined,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`❌ OpenRouter API error: ${res.status} - ${errorText}`);
        return stubSynthesize(prompt);
      }
      const data = (await res.json()) as { 
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage;
      
      if (log) log.debug(`✅ OpenRouter Response - Output: ${countTokens(content)} tokens (approx)`);
      if (usage && log) {
        log.debug(`📊 Token usage - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Total: ${usage.total_tokens}`);
      }
      if (log) log.debug(`📝 Full response: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
      
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
      }
    } catch (error) {
      console.warn('❌ OpenRouter fallback failed:', error);
    }
  }

  // Default: stub for tests/local dev
  if (log) log.debug('🔧 Using stub synthesizer (no LLM configured)');
  return stubSynthesize(prompt);
}

function stubSynthesize(prompt: string): string {
  // Enhanced stub for testing: try to parse basic patterns when LLM is not available
  const userMatch =
    prompt.match(/User:\s*([\s\S]*)$/i) ||
    prompt.match(/User request:\s*([\s\S]*)$/i);
  let userPart = userMatch && typeof userMatch[1] === 'string' ? userMatch[1] : '';
  // Remove any trailing internal sections from userPart
  userPart = userPart.split(/\n\s*Rules:/i)[0]?.split(/<!--\s*COT/i)[0]?.trim() ?? '';

  // Extract facts from prompt
  const factsMatch =
    prompt.match(/Facts(?: from tools)?(?: \(may be empty\))?:\s*([\s\S]*?)(?:\n\s*(?:User|User request)\s*:|$)/i);
  const factsPart = factsMatch && typeof factsMatch[1] === 'string' ? factsMatch[1].trim() : '';

  // If this is a router prompt, try to return basic JSON
  if (prompt.includes('Return STRICT JSON') && prompt.includes('intent')) {
    try {
      // Enhanced city extraction - look for clean city names
      let city = '';
      let month = '';
      
      // Try multiple patterns for city extraction
      const cityPatterns = [
        /\b(?:pack for|weather in|do in|visit|go to|travel to|bring to|from)\s+([A-Za-zА-Яа-я][A-Za-zА-Яа-я\- ]+?)(?:\s+(?:in|on|for|during)\s+|\s*[?.,!]|$)/i,
        /\b(?:in|to|for|from|в)\s+([A-Za-zА-Яа-я][A-Za-zА-Яа-я\- ]+?)(?:\s+(?:in|on|for|during)\s+|\s*[?.,!]|$)/i,
        /([A-Za-zА-Яа-я][A-Za-zА-Яа-я\- ]+?)\s+(?:in|on|for|during)\s+(?:winter|summer|spring|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december)/i,
        /\b(NYC|SF|LA|DC|Paris|London|Tokyo|Berlin|Madrid|Rome|Moscow|Beijing|Sydney|Toronto|Vancouver)\b/i
      ];
      
      for (const pattern of cityPatterns) {
        const match = userPart.match(pattern);
        if (match && match[1]) {
          city = match[1].trim();
          // Clean up common contamination
          city = city.replace(/^(pack|weather|do|see|visit|go|travel|bring)\s+/i, '');
          // Handle abbreviations
          const abbrevMap: Record<string, string> = {
            'NYC': 'New York City',
            'SF': 'San Francisco', 
            'LA': 'Los Angeles',
            'DC': 'Washington DC'
          };
          city = abbrevMap[city] || city;
          break;
        }
      }
      
      // Extract month/season
      const monthMatch = userPart.match(/\b(winter|summer|spring|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)\w*\b/i);
      if (monthMatch && monthMatch[1]) {
        month = monthMatch[1];
      }

      let intent = 'unknown';
      let confidence = 0.4;

      if (userPart.toLowerCase().includes('weather') || userPart.includes('погода')) {
        intent = 'weather';
        confidence = 0.8;
      } else if (userPart.toLowerCase().match(/\b(pack|bring|clothes|items|luggage|suitcase)\b/) || userPart.includes('упаковать')) {
        intent = 'packing';
        confidence = 0.8;
      } else if (userPart.toLowerCase().match(/\b(attraction|what to do|activities|museum|visit|see)\b/) || userPart.includes('что делать')) {
        intent = 'attractions';
        confidence = 0.8;
      } else if (userPart.toLowerCase().match(/\b(where should i go|destination|where to go|budget|options)\b/)) {
        intent = 'destinations';
        confidence = 0.8;
      }

      const missingSlots: string[] = [];
      if (!city) missingSlots.push('city');
      if ((intent === 'destinations' || intent === 'packing') && !month) {
        missingSlots.push('dates');
      }

      return JSON.stringify({
        intent,
        confidence,
        needExternal: intent !== 'unknown' && missingSlots.length === 0,
        slots: {
          city: city || '',
          month: month || '',
          dates: month || ''
        },
        missingSlots
      });
    } catch (e) {
      console.warn('Stub JSON parsing failed:', e);
      // Fall back to text response
    }
  }

  // Compose concise reply without leaking internal instructions
  if (factsPart && factsPart !== '(none)' && factsPart !== 'none') {
    // Remove any internal instructions from facts
    const cleanFacts = factsPart.replace(/Rules:[\s\S]*?(?=<!--|$)/, '').trim();
    return `Based on retrieved facts:\n${cleanFacts}` + (userPart ? `\nNote: ${userPart}` : '');
  }
  if (userPart) {
    return `Understood. ${userPart}`;
  }
  return 'I can help with your travel question.';
}

// NLP Service Functions
export async function extractCityWithLLM(
  message: string,
  log?: any,
): Promise<string> {
  try {
    const promptTemplate = await getPrompt('nlp_city_extraction');
    const prompt = promptTemplate.replace('{message}', message);
    const response = await callLLM(prompt, { log });
    return response.trim();
  } catch (error) {
    if (log) log.debug('LLM city extraction failed, using fallback');
    return fallbackExtractCity(message);
  }
}

export async function generateClarifyingQuestion(
  missingSlots: string[],
  context: Record<string, string> = {},
  log?: any,
): Promise<string> {
  try {
    const promptTemplate = await getPrompt('nlp_clarifier');
    const prompt = promptTemplate
      .replace('{missing_slots}', JSON.stringify(missingSlots))
      .replace('{context}', JSON.stringify(context));
    const response = await callLLM(prompt, { log });
    return response.trim();
  } catch (error) {
    if (log) log.debug('LLM clarification failed, using fallback');
    return fallbackBuildClarifyingQuestion(missingSlots, context);
  }
}

export async function classifyIntent(
  message: string,
  context: Record<string, string> = {},
  log?: any,
): Promise<IntentClassification | null> {
  try {
    const promptTemplate = await getPrompt('nlp_intent_detection');
    const prompt = promptTemplate
      .replace('{message}', message)
      .replace('{context}', JSON.stringify(context));
    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      needExternal: parsed.needExternal,
    };
  } catch (error) {
    if (log) log.debug('LLM intent classification failed');
    return null;
  }
}

export async function classifyContent(
  message: string,
  log?: any,
): Promise<ContentClassification | null> {
  try {
    const promptTemplate = await getPrompt('nlp_content_classification');
    const prompt = promptTemplate.replace('{message}', message);
    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    return {
      content_type: parsed.content_type,
      is_explicit_search: parsed.is_explicit_search,
      has_mixed_languages: parsed.has_mixed_languages,
      needs_web_search: parsed.needs_web_search,
    };
  } catch (error) {
    if (log) log.debug('LLM content classification failed');
    return null;
  }
}

// Fallback functions for when LLM fails
function fallbackExtractCity(text: string): string {
  const patterns = [
    /\b(?:in|to|for|from)\s+([A-Z][A-Za-z\- ]+(?:\s+[A-Z][A-Za-z\- ]+)*)/,
    /\b([A-Z][A-Za-z\- ]+(?:\s+[A-Z][A-Za-z\- ]+)*)\s+(?:in|on|for|during)\s+\w+/,
    /(?:pack|weather|visit|go|travel)\s+(?:for|to|in)\s+([A-Z][A-Za-z\- ]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      let city = match[1].split(/[.,!?]/)[0]?.trim();
      if (city) {
        // Handle abbreviations
        const abbrevMap: Record<string, string> = {
          'NYC': 'New York',
          'SF': 'San Francisco', 
          'LA': 'Los Angeles',
          'BOS': 'Boston',
        };
        return abbrevMap[city] || city;
      }
    }
  }
  return '';
}

function fallbackBuildClarifyingQuestion(
  missing: string[],
  slots: Record<string, string> = {},
): string {
  const miss = new Set(missing.map((m) => m.toLowerCase()));
  if (miss.has('dates') && miss.has('city')) {
    return 'Could you share the city and month/dates?';
  }
  if (miss.has('dates')) {
    return 'Which month or travel dates?';
  }
  if (miss.has('city')) {
    return 'Which city are you asking about?';
  }
  return 'Could you provide more details about your travel plans?';
}
