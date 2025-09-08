import { BraveSearch } from 'brave-search';
import { getPrompt } from '../core/prompts.js';
import { callLLM } from '../core/llm.js';
import { deepResearchPages } from './crawlee_research.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { CIRCUIT_BREAKER_CONFIG } from '../config/resilience.js';

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

type Out = { ok: true; results: BraveSearchResult[]; deepSummary?: string } | { ok: false; reason: string };

// Circuit breaker for Brave Search API
const braveSearchCircuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_CONFIG, 'brave-search');

/**
 * Search for travel information using Brave Search API
 */
export async function searchTravelInfo(query: string, log?: any, deepResearch = false): Promise<Out> {
  if (!query.trim()) {
    if (log) log.debug(`❌ Brave Search: empty query`);
    return { ok: false, reason: 'no_query' };
  }
  
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    if (log) log.debug(`❌ Brave Search: no API key configured`);
    return { ok: false, reason: 'no_api_key' };
  }

  if (log) log.debug(`🔍 Brave Search: query="${query}", apiKey="${apiKey.slice(0, 10)}..."`);

  try {
    const braveSearch = new BraveSearch(apiKey);
    
    if (log) log.debug(`🔗 Brave Search: using wrapper for query`);
    
    const startTime = Date.now();
    
    // Use circuit breaker to protect API call
    const response = await braveSearchCircuitBreaker.execute(async () => {
      return await braveSearch.webSearch(query, {
        count: 20,
        text_decorations: false, // Cleaner text without HTML markup
        spellcheck: true
      });
    });
    
    const duration = Date.now() - startTime;
    if (log) log.debug(`✅ Brave Search success after ${duration}ms`);
    
    // Extract results from the wrapper response
    const results: BraveSearchResult[] = [];
    
    if (response.web?.results) {
      for (const result of response.web.results) {
        results.push({
          title: result.title || '',
          url: result.url || '',
          description: result.description || ''
        });
      }
    }
    
    if (log) {
      log.debug(`✅ Brave Search success: ${results.length} results`);
      if (results.length > 0 && results[0]) {
        log.debug(`📝 First result: "${results[0].title}" - ${results[0].description?.slice(0, 100) || 'No description'}...`);
      }
    }
    
    // Perform deep research if requested
    let deepSummary: string | undefined;
    if (deepResearch && results.length > 0) {
      if (log) log.debug(`🔍 Starting deep research on ${Math.min(results.length, parseInt(process.env.CRAWLEE_MAX_PAGES || '8'))} pages`);
      
      try {
        const maxPages = parseInt(process.env.CRAWLEE_MAX_PAGES || '8');
        const urls = results.slice(0, maxPages).map(r => r.url);
        const crawlResult = await deepResearchPages(urls, query);
        
        if (crawlResult.ok && crawlResult.summary) {
          deepSummary = crawlResult.summary;
          if (log) log.debug(`📊 Deep research completed: ${deepSummary.slice(0, 100)}...`);
        } else {
          if (log) log.debug(`❌ Deep research failed: ${crawlResult.ok ? 'no summary' : 'crawl failed'}`);
        }
      } catch (error) {
        if (log) log.debug(`❌ Deep research error: ${error}`);
      }
    } else {
      if (log) log.debug(`⏭️ Skipping deep research: deepResearch=${deepResearch}, results=${results.length}`);
    }
    
    return { ok: true, results, deepSummary };
    
  } catch (e) {
    if (log) {
      log.debug(`❌ Brave Search error:`, {
        error: e,
        message: e instanceof Error ? e.message : 'Unknown error',
        name: e instanceof Error ? e.name : undefined
      });
    }
    
    // Handle circuit breaker errors
    if (e instanceof Error && e.name === 'CircuitBreakerError') {
      if (log) log.debug(`🔌 Brave Search circuit breaker is open`);
      return { ok: false, reason: 'circuit_breaker_open' };
    }
    
    // Handle different error types from the wrapper
    if (e instanceof Error) {
      const errorMessage = e.message.toLowerCase();
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        if (log) log.debug(`🚫 Brave Search rate limited`);
        return { ok: false, reason: 'rate_limited' };
      }
      
      if (errorMessage.includes('unauthorized') || errorMessage.includes('401') || errorMessage.includes('403')) {
        if (log) log.debug(`🔑 Brave Search authentication error`);
        return { ok: false, reason: 'auth_error' };
      }
      
      if (errorMessage.includes('timeout')) {
        if (log) log.debug(`⏰ Brave Search timeout`);
        return { ok: false, reason: 'timeout' };
      }
      
      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        if (log) log.debug(`🌐 Brave Search network error`);
        return { ok: false, reason: 'network' };
      }
    }
    
    if (log) log.debug(`❓ Brave Search unknown error type: ${e?.constructor?.name || typeof e}`);
    return { ok: false, reason: 'unknown_error' };
  }
}

/**
 * Extract weather information from search results
 */
export function extractWeatherFromResults(results: BraveSearchResult[], city: string): string | null {
  const weatherKeywords = ['temperature', 'weather', 'forecast', 'climate', '°c', '°f', 'degrees'];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    if (weatherKeywords.some(keyword => text.includes(keyword)) && text.includes(city.toLowerCase())) {
      // Extract temperature ranges from description
      const tempMatch = text.match(/(\d+)°?[cf]?[\s-]*(?:to|-)[\s-]*(\d+)°?[cf]?/i) || 
                       text.match(/high[\s:]*(\d+)°?[cf]?.*low[\s:]*(\d+)°?[cf]?/i);
      if (tempMatch) {
        return `Based on recent data, expect ${tempMatch[1]}-${tempMatch[2]}°C in ${city}`;
      }
      // Fallback to first weather-related description
      return `Weather info for ${city}: ${result.description.slice(0, 100)}...`;
    }
  }
  return null;
}

/**
 * Extract country facts from search results
 */
export async function extractCountryFromResults(results: BraveSearchResult[], country: string): Promise<string | null> {
  // Semantic extraction using LLM first
  const llmResult = await llmExtractCountryFromResults(results, country);
  if (llmResult) return llmResult;
  
  // Fallback to enhanced keyword matching
  const travelKeywords = ['currency', 'language', 'capital', 'visa', 'travel', 'timezone', 'culture'];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    const countryLower = country.toLowerCase();
    
    if (text.includes(countryLower) && travelKeywords.some(keyword => text.includes(keyword))) {
      // Extract relevant sentence containing travel info
      const sentences = result.description.split(/[.!?]+/);
      const relevantSentence = sentences.find(s => 
        s.toLowerCase().includes(countryLower) && 
        travelKeywords.some(k => s.toLowerCase().includes(k))
      );
      
      if (relevantSentence) {
        return `${country}: ${relevantSentence.trim()}`;
      }
      
      return `Travel info for ${country}: ${result.description.slice(0, 150)}...`;
    }
  }
  return null;
}

/**
 * Extract attractions from search results
 */
export function extractAttractionsFromResults(results: BraveSearchResult[], city: string): string | null {
  const attractionKeywords = ['attractions', 'things to do', 'visit', 'museum', 'park', 'landmark', 'tourist', 'best', 'top'];
  const attractions: string[] = [];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    if (attractionKeywords.some(keyword => text.includes(keyword)) && text.includes(city.toLowerCase())) {
      
      // Simple extraction: look for common attraction names in the description
      const description = result.description;
      const commonAttractions = [
        'Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral', 'Arc de Triomphe',
        'Statue of Liberty', 'Empire State Building', 'Central Park', 'Times Square',
        'Tower Bridge', 'Big Ben', 'London Eye', 'British Museum',
        'Colosseum', 'Vatican', 'Trevi Fountain', 'Spanish Steps',
        'Tokyo Tower', 'Senso-ji Temple', 'Meiji Shrine', 'Tokyo Skytree'
      ];
      
      for (const attraction of commonAttractions) {
        if (description.includes(attraction) && !attractions.includes(attraction)) {
          attractions.push(attraction);
        }
      }
      
      // If no common attractions found, extract from title
      if (attractions.length === 0) {
        const title = result.title.replace(/^\d+\.?\s*/, '').replace(/\s*-.*$/, '');
        if (title.length > 5 && title.length < 50) {
          attractions.push(title);
        }
      }
    }
  }
  
  if (attractions.length > 0) {
    return `Popular attractions in ${city} include: ${attractions.slice(0, 3).join(', ')}`;
  }
  return null;
}

/**
 * LLM-first extraction: Weather summary from search results (fallback to heuristics elsewhere)
 */
export async function llmExtractWeatherFromResults(
  results: BraveSearchResult[],
  city: string,
  log?: any,
): Promise<string | null> {
  try {
    const tpl = await getPrompt('search_extract_weather');
    const prompt = tpl
      .replace('{city}', city)
      .replace('{results}', JSON.stringify(results, null, 2));
    const raw = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(raw || '{}') as { summary?: string };
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (summary) return summary;
  } catch (e) {
    if (log) log.debug?.('LLM weather extraction failed', { error: e instanceof Error ? e.message : String(e) });
  }
  return null;
}

/**
 * LLM-first extraction: Country facts summary from search results
 */
export async function llmExtractCountryFromResults(
  results: BraveSearchResult[],
  country: string,
  log?: any,
): Promise<string | null> {
  try {
    const tpl = await getPrompt('search_extract_country');
    const prompt = tpl
      .replace('{country}', country)
      .replace('{results}', JSON.stringify(results, null, 2));
    const raw = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(raw || '{}') as { summary?: string };
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (summary) return summary;
  } catch (e) {
    if (log) log.debug?.('LLM country extraction failed', { error: e instanceof Error ? e.message : String(e) });
  }
  return null;
}

/**
 * LLM-first extraction: Attractions list from search results
 */
export async function llmExtractAttractionsFromResults(
  results: BraveSearchResult[],
  city: string,
  log?: any,
): Promise<string | null> {
  try {
    const tpl = await getPrompt('search_extract_attractions');
    const prompt = tpl
      .replace('{city}', city)
      .replace('{results}', JSON.stringify(results, null, 2));
    const raw = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(raw || '{}') as { summary?: string };
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (summary) return summary;
  } catch (e) {
    if (log) log.debug?.('LLM attractions extraction failed', { error: e instanceof Error ? e.message : String(e) });
  }
  return null;
}
