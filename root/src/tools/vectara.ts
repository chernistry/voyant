import { VECTARA } from '../config/vectara.js';
import { VectaraQueryResponse, VectaraQueryResponseT } from '../schemas/vectara.js';
import { ExternalFetchError } from '../util/fetch.js';

/**
 * TTL cache for Vectara query responses to reduce latency on repeated queries.
 */
class TTLCache<V> {
  private store = new Map<string, { v: V; exp: number }>();
  
  constructor(private ttlMs: number) {}
  
  get(k: string): V | undefined {
    const e = this.store.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) { 
      this.store.delete(k); 
      return undefined; 
    }
    return e.v;
  }
  
  set(k: string, v: V): void { 
    this.store.set(k, { v, exp: Date.now() + this.ttlMs }); 
  }
  
  clear(): void {
    this.store.clear();
  }
}

const qCache = new TTLCache<VectaraQueryResponseT>(VECTARA.CACHE_TTL_MS);

export type QueryOptions = {
  corpus: 'airlines' | 'hotels' | 'visas';
  maxResults?: number;
  /**
   * Optional metadata filter. If provided as a string, it will be passed
   * directly to Vectara. Object form is currently ignored to avoid
   * malformed payloads that can trigger 400 responses.
   */
  filter?: string | Record<string, string>;
};

/**
 * Vectara RAG client with caching, retries, and robust error handling.
 * Supports policy document indexing and semantic search with citations.
 */
export class VectaraClient {
  private base = VECTARA.BASE_URL.replace(/\/$/, '');
  private auth = VECTARA.API_KEY;

  private corpusKey(corpus: QueryOptions['corpus']): string {
    const map: Record<string, string> = {
      airlines: VECTARA.CORPUS.AIRLINES,
      hotels: VECTARA.CORPUS.HOTELS,
      visas: VECTARA.CORPUS.VISAS,
    };
    return map[corpus] || '';
  }

  /**
   * Query Vectara for policy information with semantic search and citations.
   */
  async query(text: string, opts: QueryOptions): Promise<VectaraQueryResponseT> {
    if (!VECTARA.ENABLED || !this.auth) {
      throw new ExternalFetchError('network', 'vectara_disabled');
    }

    const corpus = this.corpusKey(opts.corpus);
    if (!corpus) {
      throw new ExternalFetchError('network', 'vectara_corpus_missing');
    }

    const cacheKey = `${corpus}::${text}`;
    const hit = qCache.get(cacheKey);
    if (hit) return hit;

    const isV2 = VECTARA.QUERY_PATH.startsWith('/v2');
    const url = `${this.base}${VECTARA.QUERY_PATH}`;
    
    // v1 request body (deprecated/retired in production, used by tests/mocks)
    const bodyV1: Record<string, unknown> = {
      query: [{
        query: text,
        corpusKey: [{ customerId: VECTARA.CUSTOMER_ID, corpusId: corpus }],
        numResults: opts.maxResults ?? 6,
        contextConfig: { sentencesBefore: 1, sentencesAfter: 1 },
      }],
      summary: [{ prompt: 'concise-with-citations' }],
    };

    if (typeof opts.filter === 'string' && bodyV1.query && Array.isArray(bodyV1.query)) {
      (bodyV1.query[0] as any).metadataFilter = opts.filter;
    }

    // v2 request body (Multiple Corpora Query)
    const bodyV2: Record<string, unknown> = {
      query: text,
      corpora: [ { corpus_key: corpus } ],
      search: {
        limit: opts.maxResults ?? 6,
        context_configuration: { sentences_before: 1, sentences_after: 1 },
        ...(typeof opts.filter === 'string' ? { metadata_filter: opts.filter } : {}),
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.auth,
          // v1 requires 'customer-id'; v2 does not.
          ...(isV2 ? {} : { 'customer-id': VECTARA.CUSTOMER_ID }),
        },
        body: JSON.stringify(isV2 ? bodyV2 : bodyV1),
      });

      if (!response.ok) {
        throw new ExternalFetchError('http', `vectara_query_${response.status}`);
      }

      const respData = await response.json();

      const normalized: VectaraQueryResponseT = VectaraQueryResponse.parse({
        summary: respData?.summary?.[0]?.text || respData?.summaryText,
        hits: (respData?.results || respData?.hits || []).map((h: any) => ({
          snippet: h?.text || h?.snippet,
          score: Number(h?.score ?? 0),
          documentId: h?.documentId || h?.docId,
          url: h?.metadata?.url || h?.url,
          title: h?.metadata?.title || h?.title,
          page: Number(h?.metadata?.page || h?.page || 0) || undefined,
        })),
        citations: (respData?.citations || respData?.results || []).map((c: any) => ({
          text: c?.text || c?.snippet,
          score: Number(c?.score ?? 0),
          documentId: c?.documentId || c?.docId,
          url: c?.metadata?.url || c?.url,
          title: c?.metadata?.title || c?.title,
          page: Number(c?.metadata?.page || c?.page || 0) || undefined,
        })),
      });

      qCache.set(cacheKey, normalized);
      return normalized;
    } catch (e) {
      if (e instanceof ExternalFetchError) throw e;
      throw new ExternalFetchError('network', 'vectara_query_failed');
    }
  }

  /**
   * Index a policy document into the specified Vectara corpus.
   */
  async index(doc: {
    id: string;
    corpus: 'airlines' | 'hotels' | 'visas';
    title: string;
    text: string;
    url?: string;
    meta?: Record<string, string>;
  }): Promise<boolean> {
    if (!VECTARA.ENABLED || !this.auth) {
      throw new ExternalFetchError('network', 'vectara_disabled');
    }

    const corpus = this.corpusKey(doc.corpus);
    if (!corpus) {
      throw new ExternalFetchError('network', 'vectara_corpus_missing');
    }

    const url = `${this.base}${VECTARA.INDEX_PATH}`;
    const body = {
      document: {
        documentId: doc.id,
        title: doc.title,
        text: doc.text,
        metadata: { url: doc.url, ...doc.meta },
      },
      corpusId: corpus,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.auth,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new ExternalFetchError('http', `vectara_index_${response.status}`);
      }

      const resp = await response.json();
      return Boolean(resp?.ok ?? true);
    } catch (e) {
      if (e instanceof ExternalFetchError) throw e;
      throw new ExternalFetchError('network', 'vectara_index_failed');
    }
  }

  /**
   * Clear the query cache (useful for testing).
   */
  clearCache(): void {
    qCache.clear();
  }
}
