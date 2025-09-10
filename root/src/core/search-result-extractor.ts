import { z } from 'zod';
import { classifyContent } from './transformers-classifier.js';
import { extractEntitiesEnhanced } from './ner-enhanced.js';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import type pino from 'pino';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export const ExtractionResult = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  aiMethod: z.enum(['transformers', 'llm', 'fallback']),
  entities: z.array(z.object({
    text: z.string(),
    type: z.string(),
    value: z.string().optional()
  })).optional(),
  relevanceScore: z.number().min(0).max(1).optional()
});

export type ExtractionResultT = z.infer<typeof ExtractionResult>;

async function tryTransformersExtraction(
  results: SearchResult[],
  query: string,
  extractionType: 'weather' | 'attractions' | 'country' | 'general',
  log?: pino.Logger
): Promise<ExtractionResultT | null> {
  try {
    // Step 1: Classify and score result relevance
    const scoredResults = await Promise.all(
      results.slice(0, 5).map(async (result) => {
        const text = `${result.title} ${result.description}`;
        const contentClass = await classifyContent(text, log);
        const entityResult = await extractEntitiesEnhanced(text, log);
        
        return {
          ...result,
          relevanceScore: contentClass.confidence,
          entities: entityResult.entities
        };
      })
    );

    // Step 2: Filter and rank by relevance
    const relevantResults = scoredResults
      .filter(r => r.relevanceScore > 0.4)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (relevantResults.length === 0) {
      return null;
    }

    // Step 3: Extract based on type using NER
    const topResult = relevantResults[0];
    if (!topResult) {
      return null;
    }
    
    const allEntities = relevantResults.flatMap(r => r.entities);
    
    let summary = '';
    const extractedEntities: Array<{text: string, type: string, value?: string}> = [];

    switch (extractionType) {
      case 'weather':
        // Extract temperature, weather conditions
        const temps = allEntities.filter(e => /temperature|temp|degrees/.test(e.text.toLowerCase()));
        const conditions = allEntities.filter(e => /sunny|cloudy|rain|snow|clear/.test(e.text.toLowerCase()));
        
        if (temps.length > 0 || conditions.length > 0) {
          summary = `Weather information: ${topResult.description.slice(0, 150)}`;
          extractedEntities.push(...temps.map(t => ({ text: t.text, type: 'temperature' })));
          extractedEntities.push(...conditions.map(c => ({ text: c.text, type: 'condition' })));
        }
        break;

      case 'attractions':
        // Extract location names and attraction types
        const locations = allEntities.filter(e => e.entity_group === 'B-LOC');
        const attractions = allEntities.filter(e => 
          /museum|park|tower|cathedral|palace|monument/.test(e.text.toLowerCase())
        );
        
        if (locations.length > 0 || attractions.length > 0) {
          summary = `Attractions: ${topResult.description.slice(0, 150)}`;
          extractedEntities.push(...locations.map(l => ({ text: l.text, type: 'location' })));
          extractedEntities.push(...attractions.map(a => ({ text: a.text, type: 'attraction' })));
        }
        break;

      case 'country':
        // Extract country facts
        const countries = allEntities.filter(e => e.entity_group === 'B-LOC');
        const currencies = allEntities.filter(e => /currency|dollar|euro|pound/.test(e.text.toLowerCase()));
        
        if (countries.length > 0) {
          summary = `Country information: ${topResult.description.slice(0, 150)}`;
          extractedEntities.push(...countries.map(c => ({ text: c.text, type: 'country' })));
          extractedEntities.push(...currencies.map(c => ({ text: c.text, type: 'currency' })));
        }
        break;

      default:
        summary = topResult.description.slice(0, 150);
    }

    if (summary) {
      return {
        summary,
        confidence: topResult.relevanceScore,
        aiMethod: 'transformers',
        entities: extractedEntities,
        relevanceScore: topResult.relevanceScore
      };
    }

    return null;
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ Transformers extraction failed');
    }
    return null;
  }
}

async function tryLLMExtraction(
  results: SearchResult[],
  query: string,
  extractionType: 'weather' | 'attractions' | 'country' | 'general',
  log?: pino.Logger
): Promise<ExtractionResultT | null> {
  try {
    const topResults = results.slice(0, 3);
    const tpl = await getPrompt('search_result_extractor');
    const prompt = tpl
      .replace('{query}', query)
      .replace('{results}',
        topResults
          .map((r, i) => `${i + 1}. ${r.title}\n${r.description}`)
          .join('\n\n'),
      )
      .replace('{extractionType}', extractionType);

    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    
    if (parsed.confidence > 0.4 && parsed.summary) {
      return {
        summary: parsed.summary,
        confidence: parsed.confidence,
        aiMethod: 'llm',
        entities: parsed.entities || [],
        relevanceScore: parsed.relevanceScore || parsed.confidence
      };
    }
    
    return null;
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ LLM extraction failed');
    }
    return null;
  }
}

/**
 * Extract information from search results using AI-first approach: Transformers → LLM → fallback
 */
export async function extractFromSearchResults(
  results: SearchResult[],
  query: string,
  extractionType: 'weather' | 'attractions' | 'country' | 'general' = 'general',
  log?: pino.Logger
): Promise<ExtractionResultT> {
  if (!results || results.length === 0) {
    return {
      summary: 'No search results available',
      confidence: 0.1,
      aiMethod: 'fallback'
    };
  }

  // Step 1: Try Transformers extraction
  const transformersResult = await tryTransformersExtraction(results, query, extractionType, log);
  if (transformersResult) {
    if (log?.debug) {
      log.debug({
        method: 'transformers',
        confidence: transformersResult.confidence,
        entitiesCount: transformersResult.entities?.length || 0
      }, '🎯 TRANSFORMERS: Information extracted');
    }
    return transformersResult;
  }

  // Step 2: Try LLM extraction
  const llmResult = await tryLLMExtraction(results, query, extractionType, log);
  if (llmResult) {
    if (log?.debug) {
      log.debug({
        method: 'llm',
        confidence: llmResult.confidence,
        entitiesCount: llmResult.entities?.length || 0
      }, '🤖 LLM: Information extracted');
    }
    return llmResult;
  }

  // Step 3: Minimal fallback - basic keyword matching
  const keywords = getKeywordsForType(extractionType);
  const relevantResult = results.find(r => {
    const text = `${r.title} ${r.description}`.toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
  });

  const fallbackSummary = relevantResult 
    ? `${relevantResult.description.slice(0, 150)}...`
    : `${results[0]?.description.slice(0, 150) || 'No description available'}...`;

  if (log?.debug) {
    log.debug({
      method: 'fallback',
      extractionType,
      resultUsed: relevantResult ? 'keyword_match' : 'first_result'
    }, '❌ AI FAILED: Using minimal fallback extraction');
  }

  return {
    summary: fallbackSummary,
    confidence: 0.3,
    aiMethod: 'fallback'
  };
}

function getKeywordsForType(type: string): string[] {
  switch (type) {
    case 'weather':
      return ['temperature', 'weather', 'forecast', 'climate', '°c', '°f', 'degrees'];
    case 'attractions':
      return ['attractions', 'things to do', 'visit', 'museum', 'park', 'landmark', 'tourist'];
    case 'country':
      return ['currency', 'language', 'capital', 'population', 'travel', 'country'];
    default:
      return ['information', 'about', 'guide', 'facts'];
  }
}
