import { TavilyClient } from 'tavily';
import { deepResearchPages } from './crawlee_research.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { CIRCUIT_BREAKER_CONFIG } from '../config/resilience.js';
import type { SearchResult, Out } from './brave_search.js';

const tavilyCircuitBreaker = new CircuitBreaker(
  CIRCUIT_BREAKER_CONFIG,
  'tavily-search',
);

/**
 * Search for travel information using Tavily API
 */
export async function searchTravelInfo(
  query: string,
  log?: any,
  deepResearch = false,
): Promise<Out> {
  if (!query.trim()) {
    log?.debug?.('❌ Tavily: empty query');
    return { ok: false, reason: 'no_query' };
  }
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    log?.debug?.('❌ Tavily: no API key configured');
    return { ok: false, reason: 'no_api_key' };
  }
  const client = new TavilyClient({ apiKey });
  try {
    const start = Date.now();
    const res = await tavilyCircuitBreaker.execute(() =>
      client.search({
        query,
        search_depth: 'advanced',
        include_answer: true,
        include_images: false,
        max_results: 20,
      }),
    );
    const duration = Date.now() - start;
    log?.debug?.(`✅ Tavily success after ${duration}ms`);
    const results: SearchResult[] =
      res.results?.map(r => ({
        title: r.title || '',
        url: r.url || '',
        description: r.content || '',
      })) ?? [];
    let deepSummary = res.answer?.trim();
    if (deepResearch && results.length > 0) {
      try {
        const maxPages = parseInt(process.env.CRAWLEE_MAX_PAGES || '8', 10);
        const urls = results.slice(0, maxPages).map(r => r.url);
        const crawl = await deepResearchPages(urls, query);
        if (crawl.ok && crawl.summary) deepSummary = crawl.summary;
      } catch (e) {
        log?.debug?.(`❌ Tavily deep research error: ${e}`);
      }
    }
    return { ok: true, results, deepSummary };
  } catch (e: unknown) {
    log?.debug?.('❌ Tavily error', e);
    if (e instanceof Error && e.name === 'CircuitBreakerError') {
      return { ok: false, reason: 'circuit_breaker_open' };
    }
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
      return { ok: false, reason: 'auth_error' };
    }
    if (msg.includes('429') || msg.includes('rate')) {
      return { ok: false, reason: 'rate_limited' };
    }
    if (msg.includes('timeout')) {
      return { ok: false, reason: 'timeout' };
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return { ok: false, reason: 'network' };
    }
    return { ok: false, reason: 'unknown_error' };
  }
}
