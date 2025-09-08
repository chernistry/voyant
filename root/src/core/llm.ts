import 'dotenv/config';
import { z } from 'zod';
import { getContext } from './memory.js';
import { fetch as undiciFetch } from 'undici';
import { getPrompt } from './prompts.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { CIRCUIT_BREAKER_CONFIG } from '../config/resilience.js';

// Circuit breaker for LLM API calls
const llmCircuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_CONFIG, 'llm');

type ResponseFormat = 'text' | 'json';

// Unified content classification schema
const ContentClassificationSchema = z.object({
  content_type: z.enum(['travel', 'system', 'policy', 'unrelated', 'budget', 'restaurant', 'flight', 'gibberish', 'emoji_only']),
  is_explicit_search: z.boolean(),
  has_mixed_languages: z.boolean().optional().default(false),
  needs_web_search: z.boolean().optional().default(false)
});

export type ContentClassification = z.infer<typeof ContentClassificationSchema>;

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
  _opts: { responseFormat?: ResponseFormat; log?: any; timeoutMs?: number } = {},
): Promise<string> {
  const jsonHint = /strict JSON|Return strict JSON|Output \(strict JSON only\)/i.test(prompt);
  const format: ResponseFormat = _opts.responseFormat ?? (jsonHint ? 'json' : 'text');
  const log = _opts.log;

  const inputTokens = countTokens(prompt);
  if (log) log.debug(`🤖 LLM Call - Input: ${inputTokens} tokens, Format: ${format}`);
  
  // Model fallback chain from env or default
  const defaultModels = [
    'mistralai/mistral-nemo',
    'tngtech/deepseek-r1t2-chimera:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free'
  ];
  const models = process.env.LLM_MODELS?.split(',').map(m => m.trim()) || defaultModels;
  
  // Try configured provider first
  const baseUrl = process.env.LLM_PROVIDER_BASEURL;
  const apiKey = process.env.LLM_API_KEY;
  const preferredModel = process.env.LLM_MODEL ?? models[0];

  if (baseUrl && apiKey && preferredModel) {
    // Try preferred model first
    const result = await tryModel(baseUrl, apiKey, preferredModel, prompt, format, log || undefined, _opts.timeoutMs);
    if (result) return result;
    
    // Fallback to other models
    for (const model of models) {
      if (model !== preferredModel) {
        const result = await tryModel(baseUrl, apiKey, model, prompt, format, log || undefined, _opts.timeoutMs);
        if (result) return result;
      }
    }
  }

  // Try OpenRouter fallback
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    for (const model of models) {
      const result = await tryModel('https://openrouter.ai/api/v1', openrouterKey, model, prompt, format, log || undefined, _opts.timeoutMs);
      if (result) return result;
    }
  }

  if (log) log.warn('All LLM providers failed, using stub');
  return stubSynthesize(prompt);
}

async function tryModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  format: ResponseFormat,
  log?: any,
  timeoutMs: number = 2500
): Promise<string | null> {
  try {
    if (log?.debug) log.debug(`🔗 Trying model: ${model} at ${baseUrl}`);
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const result = await llmCircuitBreaker.execute(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('llm_timeout')), Math.max(500, timeoutMs));
      
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
          max_tokens: 2000,
          ...(format === 'json' ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      
      if (!res.ok) {
        const errorText = await res.text();
        if (log?.debug) log.debug(`❌ Model ${model} failed: ${res.status} - ${errorText.substring(0, 200)}`);
        throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
      }
      
      return res;
    });
    
    const data = (await result.json()) as { 
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = data?.choices?.[0]?.message?.content ?? '';
    
    if (typeof content === 'string' && content.trim().length > 0) {
      if (log?.debug) log.debug(`✅ Model ${model} succeeded - Output: ${countTokens(content)} tokens`);
      return content.trim();
    }
    
    if (log?.debug) log.debug(`❌ Model ${model} returned empty content`);
    return null;
  } catch (e) {
    // Handle circuit breaker errors
    if (e instanceof Error && e.name === 'CircuitBreakerError') {
      if (log?.debug) log.debug(`🔌 Model ${model} circuit breaker is open`);
      return null;
    }
    
    if (log?.debug) log.debug(`❌ Model ${model} error: ${String(e)}`);
    return null;
  }
}

/**
 * Try to extract a JSON object from an LLM response safely.
 * Returns undefined if no valid JSON object can be found.
 */
export function safeExtractJson(text: string): unknown | undefined {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]);
  } catch {
    return undefined;
  }
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
    const response = await callLLM(prompt, { responseFormat: 'json', log });
    
    if (log?.debug) {
      log.debug({ 
        message: message.substring(0, 120), 
        response: response.substring(0, 120),
        responseType: typeof response 
      }, 'content_classification_response');
    }
    
    // Parse JSON response with Zod schema validation
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      // Fallback: extract JSON from response if wrapped in text
      const extracted = safeExtractJson(response);
      if (!extracted) {
        if (log?.debug) log.debug({ response }, 'content_classification_no_json_found');
        return null;
      }
      parsed = extracted;
    }
    
    // Validate with Zod schema
    const result = ContentClassificationSchema.safeParse(parsed);
    if (!result.success) {
      if (log?.debug) log.debug({ 
        parsed, 
        errors: result.error.errors 
      }, 'content_classification_schema_validation_failed');
      return null;
    }
    
    return result.data;
  } catch (error) {
    if (log?.debug) log.debug({ 
      error: String(error), 
      message: message.substring(0, 120) 
    }, 'content_classification_failed');
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
    
    // Validate length constraint (≤12 words)
    const wordCount = optimized.split(/\s+/).filter(Boolean).length;
    if (wordCount > 12) {
      // Truncate to first 12 words
      optimized = optimized.split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
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
