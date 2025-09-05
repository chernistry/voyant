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
          ...(format === 'json' ? { response_format: { type: 'json_object' } } : {}),
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
          ...(format === 'json' ? { response_format: { type: 'json_object' } } : {}),
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
  // When LLM is unavailable, return appropriate fallback responses
  
  // If this is a router prompt, return basic JSON
  if (prompt.includes('Return STRICT JSON') && prompt.includes('intent')) {
    return JSON.stringify({
      intent: 'unknown',
      confidence: 0.3,
      needExternal: false,
      slots: {}
    });
  }
  
  // If this is a content classification prompt, return basic JSON
  if (prompt.includes('content_type') && prompt.includes('is_explicit_search')) {
    return JSON.stringify({
      content_type: 'travel',
      is_explicit_search: false,
      has_mixed_languages: false,
      needs_web_search: false
    });
  }
  
  // For regular chat responses, return a helpful error message
  return "I'm experiencing technical difficulties right now. Please try again in a moment, or ask me something about weather, destinations, packing, or attractions.";
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
    const response = await callLLM(prompt, { log }); // Remove responseFormat: 'json'
    
    if (log) log.debug({ message, response: response.substring(0, 200) }, 'content_classification_response');
    
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (log) log.debug({ response }, 'content_classification_no_json_found');
      return null;
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate required fields
    if (typeof parsed.is_explicit_search !== 'boolean' || 
        typeof parsed.content_type !== 'string') {
      if (log) log.debug({ parsed }, 'content_classification_invalid_format');
      return null;
    }
    
    return {
      content_type: parsed.content_type,
      is_explicit_search: parsed.is_explicit_search,
      has_mixed_languages: parsed.has_mixed_languages || false,
      needs_web_search: parsed.needs_web_search || false,
    };
  } catch (error) {
    if (log) log.debug({ error: String(error), message }, 'content_classification_failed');
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

// Simple query optimization cache
const queryCache = new Map<string, string>();

export async function optimizeSearchQuery(
  query: string,
  context: Record<string, string> = {},
  intent: string = 'unknown',
  log?: any,
): Promise<string> {
  // Check cache first
  const cacheKey = `${query}:${intent}:${JSON.stringify(context)}`;
  if (queryCache.has(cacheKey)) {
    if (log) log.debug('Using cached optimized query');
    return queryCache.get(cacheKey)!;
  }

  try {
    const promptTemplate = await getPrompt('search_query_optimizer');
    const prompt = promptTemplate
      .replace('{query}', query)
      .replace('{context}', JSON.stringify(context))
      .replace('{intent}', intent);
    
    const response = await callLLM(prompt, { log });
    let optimized = response.trim();
    
    // Remove quotes that LLM might add
    optimized = optimized.replace(/^["']|["']$/g, '');
    
    // Validate length constraint (≤7 words)
    const wordCount = optimized.split(/\s+/).length;
    if (wordCount > 7) {
      // Truncate to first 7 words
      optimized = optimized.split(/\s+/).slice(0, 7).join(' ');
    }
    
    // Cache the result
    queryCache.set(cacheKey, optimized);
    
    // Limit cache size
    if (queryCache.size > 100) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) {
        queryCache.delete(firstKey);
      }
    }
    
    if (log) log.debug({ original: query, optimized, wordCount }, 'query_optimized');
    return optimized;
  } catch (error) {
    if (log) log.debug('Query optimization failed, using fallback');
    return fallbackOptimizeQuery(query);
  }
}

function fallbackOptimizeQuery(query: string): string {
  // Simple fallback: remove common filler words and truncate
  const fillerWords = ['what', 'is', 'the', 'a', 'an', 'how', 'can', 'you', 'tell', 'me', 'about', 'some', 'good', 'best'];
  const words = query.toLowerCase().split(/\s+/)
    .filter(word => !fillerWords.includes(word) && word.length > 2)
    .slice(0, 7);
  
  return words.join(' ') || query.slice(0, 50);
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
