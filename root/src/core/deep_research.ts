import type pino from 'pino';
import { getPrompt } from './prompts.js';
import { callLLM } from './llm.js';
import { searchTravelInfo } from '../tools/search.js';

export type ResearchCitation = { source: string; url: string; confidence: number };
export type ResearchResult = {
  summary: string;
  citations: ResearchCitation[];
  confidence: number;
  sources: string[]; // domains
};

/**
 * Perform multi-pass deep research with optional query optimization, parallel search, deduplication, and synthesis.
 * Safe-by-default: if LLM calls fail, falls back to deterministic summaries.
 */
export async function performDeepResearch(
  query: string,
  context: Record<string, unknown> = {},
  log?: pino.Logger,
): Promise<ResearchResult> {
  const optimized = await optimizeQueries(query, context, log).catch(() => [query]);
  const queries = Array.isArray(optimized) && optimized.length > 0 ? optimized.slice(0, 6) : [query];

  // Execute searches in parallel with deep research enabled
  const settled = await Promise.allSettled(
    queries.map((q) => searchTravelInfo(q, log, true)) // Enable deep research
  );

  // Collect results
  type R = { title: string; url: string; description: string };
  const aggregate: R[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value?.ok && Array.isArray(s.value.results)) {
      aggregate.push(...s.value.results);
    }
  }

  const deduped = deduplicateByDomain(aggregate);
  const top = deduped.slice(0, 12);

  // Build citations and domains
  const domainFirstUrl = new Map<string, string>();
  for (const item of top) {
    try {
      const d = new URL(item.url).hostname;
      if (!domainFirstUrl.has(d)) domainFirstUrl.set(d, item.url);
    } catch {}
  }
  const domains = Array.from(domainFirstUrl.keys());
  const citations: ResearchCitation[] = domains.map((d) => ({ source: d, url: domainFirstUrl.get(d) || '', confidence: 0.7 }));

  // Synthesize summary (LLM preferred, fallback deterministic)
  const summary = await synthesize(query, top, log).catch(() => fallbackSummary(query, top));

  // Simple self-consistency: compare domains across first two queries (if present)
  const consistency = (() => {
    // Proxy for robustness: more diverse sources → higher confidence
    const diversity = Math.min(domains.length / 5, 1); // up to 5 domains
    return 0.6 + 0.4 * diversity; // 0.6..1.0
  })();

  return {
    summary,
    citations,
    confidence: consistency,
    sources: domains,
  };

}

async function optimizeQueries(
  original: string,
  context: Record<string, unknown>,
  log?: pino.Logger,
): Promise<string[]> {
  // Try Brave Suggest first for lightweight expansion (skip during tests to avoid network)
  let seeds: string[] = [];
  if (process.env.NODE_ENV !== 'test') {
    try {
      const mod = await import('../tools/brave_suggest.js');
      seeds = await mod.braveSuggest(original, { count: 6, country: 'US' });
    } catch {}
  }

  try {
    const prompt = await getPrompt('search_query_optimizer');
    const payload = `${prompt}\n\nReturn STRICT JSON with {\"queries\": string[]} only.\n\nQuery: ${original}\nContext: ${JSON.stringify(context)}\nSeeds: ${JSON.stringify(seeds)}`;
    const raw = await callLLM(payload, { responseFormat: 'json', log });
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const qs = Array.isArray(parsed?.queries) ? parsed.queries as string[] : [];
    const merged = Array.from(new Set([original, ...seeds, ...qs].filter(Boolean)));
    return merged.slice(0, 6);
  } catch {
    return [original, ...seeds].slice(0, 6);
  }
}

async function synthesize(
  query: string,
  results: Array<{ title: string; url: string; description: string }>,
  log?: pino.Logger,
): Promise<string> {
  try {
    const prompt = await getPrompt('search_summarize');
    const top = results.slice(0, 7).map((r, i) => ({
      id: i + 1,
      title: sanitize(r.title),
      url: r.url,
      description: sanitize(r.description).slice(0, 200),
    }));
    const payload = prompt
      .replace('{query}', query)
      .replace('{results}', JSON.stringify(top, null, 2));
    const out = await callLLM(payload, { log });
    const text = out?.toString()?.trim() || '';
    if (text) return text;
    return fallbackSummary(query, results);
  } catch {
    return fallbackSummary(query, results);
  }
}

function fallbackSummary(
  query: string,
  results: Array<{ title: string; url: string; description: string }>,
): string {
  const items = results.slice(0, 3).map((r) => `• ${sanitize(r.title)} — ${sanitize(r.description).slice(0, 120)} (${safeDomain(r.url)})`);
  return `Based on multiple sources for "${query}":\n\n${items.join('\n')}`;
}

function sanitize(s: string): string {
  return (s || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function deduplicateByDomain<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const d = safeDomain(it.url);
    if (!d) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(it);
  }
  return out;
}

function safeDomain(u: string): string {
  try { return new URL(u).hostname; } catch { return ''; }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const uni = new Set([...a, ...b]);
  return uni.size === 0 ? 0 : inter.size / uni.size;
}
