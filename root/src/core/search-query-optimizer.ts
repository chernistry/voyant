import { z } from 'zod';
import { classifyContent, classifyIntent } from './transformers-classifier.js';
import { extractEntitiesEnhanced } from './ner-enhanced.js';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import type pino from 'pino';

export const SearchQueryOptimization = z.object({
  optimizedQuery: z.string(),
  queryType: z.enum(['weather', 'attractions', 'destinations', 'country', 'general']),
  confidence: z.number().min(0).max(1),
  aiMethod: z.enum(['transformers', 'llm', 'fallback']),
  entities: z.array(z.object({
    text: z.string(),
    type: z.string(),
    confidence: z.number()
  })).optional()
});

export type SearchQueryOptimizationT = z.infer<typeof SearchQueryOptimization>;

async function tryTransformersOptimization(
  query: string, 
  context: Record<string, any>,
  log?: pino.Logger
): Promise<SearchQueryOptimizationT | null> {
  try {
    // Step 1: Content and intent classification
    const [contentClass, intentClass, entityResult] = await Promise.all([
      classifyContent(query, log),
      classifyIntent(query, log),
      extractEntitiesEnhanced(query, log)
    ]);

    if (contentClass.confidence < 0.6) {
      return null;
    }

    // Step 2: Extract entities for query enhancement
    const entities = entityResult.entities.map(e => ({
      text: e.text,
      type: e.entity_group,
      confidence: e.score
    }));

    // Step 3: Build optimized query based on intent and entities
    let optimizedQuery = query;
    let queryType: SearchQueryOptimizationT['queryType'] = 'general';

    const lowerQuery = query.toLowerCase();
    
    // Weather optimization
    if (intentClass.intent === 'weather' || /weather|temperature|forecast|climate/.test(lowerQuery)) {
      queryType = 'weather';
      const locations = entities.filter(e => e.type === 'B-LOC');
      if (locations.length > 0 && locations[0]) {
        optimizedQuery = `${locations[0].text} weather forecast temperature current conditions`;
      } else {
        optimizedQuery = `${query} weather forecast temperature`;
      }
    }
    // Attractions optimization
    else if (intentClass.intent === 'attractions' || /attractions|things to do|visit|museum/.test(lowerQuery)) {
      queryType = 'attractions';
      const locations = entities.filter(e => e.type === 'B-LOC');
      if (locations.length > 0 && locations[0]) {
        optimizedQuery = `${locations[0].text} top attractions things to do tourist sites landmarks`;
      } else {
        optimizedQuery = `${query} attractions tourist sites things to do`;
      }
    }
    // Destinations optimization
    else if (intentClass.intent === 'destinations' || /where to go|destination|travel to/.test(lowerQuery)) {
      queryType = 'destinations';
      const dates = entityResult.dates.map(d => d.text);
      if (dates.length > 0) {
        optimizedQuery = `${query} travel destinations ${dates[0]} best places to visit`;
      } else {
        optimizedQuery = `${query} travel destinations best places to visit`;
      }
    }
    // Country information optimization
    else if (/country|currency|language|capital|visa/.test(lowerQuery)) {
      queryType = 'country';
      const locations = entities.filter(e => e.type === 'B-LOC');
      if (locations.length > 0 && locations[0]) {
        optimizedQuery = `${locations[0].text} country information currency language capital travel guide`;
      } else {
        optimizedQuery = `${query} country information travel guide`;
      }
    }

    // Add context-based enhancements
    if (context.month) {
      optimizedQuery += ` ${context.month}`;
    }
    if (context.travelerProfile && /family|kids/.test(context.travelerProfile)) {
      optimizedQuery += ' family friendly';
    }

    return {
      optimizedQuery: optimizedQuery.trim(),
      queryType,
      confidence: Math.max(contentClass.confidence, intentClass.confidence),
      aiMethod: 'transformers',
      entities
    };

  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ Transformers query optimization failed');
    }
    return null;
  }
}

async function tryLLMOptimization(
  query: string,
  context: Record<string, any>,
  log?: pino.Logger
): Promise<SearchQueryOptimizationT | null> {
  try {
    const tpl = await getPrompt('search_query_optimizer_llm');
    const prompt = tpl
      .replace('{query}', query)
      .replace('{context}', JSON.stringify(context));

    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    
    if (parsed.confidence > 0.4 && parsed.optimizedQuery) {
      return {
        optimizedQuery: parsed.optimizedQuery,
        queryType: parsed.queryType || 'general',
        confidence: parsed.confidence,
        aiMethod: 'llm'
      };
    }
    
    return null;
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ LLM query optimization failed');
    }
    return null;
  }
}

/**
 * Optimize search queries using AI-first approach: Transformers → LLM → fallback
 */
export async function optimizeSearchQuery(
  query: string,
  context: Record<string, any> = {},
  log?: pino.Logger
): Promise<SearchQueryOptimizationT> {
  if (!query || query.trim().length === 0) {
    return {
      optimizedQuery: query,
      queryType: 'general',
      confidence: 0.1,
      aiMethod: 'fallback'
    };
  }

  // Step 1: Try Transformers optimization
  const transformersResult = await tryTransformersOptimization(query, context, log);
  if (transformersResult) {
    if (log?.debug) {
      log.debug({ 
        original: query,
        optimized: transformersResult.optimizedQuery,
        method: 'transformers',
        confidence: transformersResult.confidence
      }, '🎯 TRANSFORMERS: Query optimized');
    }
    return transformersResult;
  }

  // Step 2: Try LLM optimization
  const llmResult = await tryLLMOptimization(query, context, log);
  if (llmResult) {
    if (log?.debug) {
      log.debug({
        original: query,
        optimized: llmResult.optimizedQuery,
        method: 'llm',
        confidence: llmResult.confidence
      }, '🤖 LLM: Query optimized');
    }
    return llmResult;
  }

  // Step 3: Minimal fallback - basic keyword enhancement
  let optimizedQuery = query;
  const lowerQuery = query.toLowerCase();
  
  if (/weather/.test(lowerQuery)) {
    optimizedQuery += ' forecast temperature';
  } else if (/attractions|things to do/.test(lowerQuery)) {
    optimizedQuery += ' tourist sites';
  } else if (/travel|destination/.test(lowerQuery)) {
    optimizedQuery += ' travel guide';
  }

  if (log?.debug) {
    log.debug({
      original: query,
      optimized: optimizedQuery,
      method: 'fallback'
    }, '❌ AI FAILED: Using minimal fallback optimization');
  }

  return {
    optimizedQuery,
    queryType: 'general',
    confidence: 0.3,
    aiMethod: 'fallback'
  };
}
