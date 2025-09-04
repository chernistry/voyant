import { setTimeout as delay } from 'node:timers/promises';
import { observeExternal } from './metrics.js';

// Use standard fetch in test environment for nock compatibility
async function getFetch() {
  if (process.env.NODE_ENV === 'test') {
    return globalThis.fetch;
  } else {
    const undici = await import('undici');
    return undici.fetch;
  }
}

const ALLOWLIST = new Set<string>([
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'restcountries.com',
  'api.search.brave.com',
  'api.opentripmap.com',
]);

export class ExternalFetchError extends Error {
  kind: 'timeout' | 'http' | 'network';
  status?: number;
  constructor(kind: 'timeout' | 'http' | 'network', message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const BASE_DELAY = 200;
const MAX_DELAY = 2000;
const JITTER_FACTOR = 0.25;

async function calculateDelay(attempt: number): Promise<void> {
  const expDelay = BASE_DELAY * Math.pow(1.5, attempt);
  const jitter = expDelay * JITTER_FACTOR * (Math.random() * 2 - 1);
  const totalDelay = Math.min(expDelay + jitter, MAX_DELAY);
  await delay(totalDelay);
}

/**
 * Fetches JSON with timeout and exponential backoff retry with jitter.
 * @param url Request URL
 * @param opts Optional timeout and retry count
 */
export async function fetchJSON<T = unknown>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; target?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const retries = opts.retries ?? 3;
  // Enforce host allowlist for security
  try {
    const u = new URL(url);
    if (!ALLOWLIST.has(u.hostname)) {
      throw new ExternalFetchError('network', 'host_not_allowed');
    }
  } catch (e) {
    if (e instanceof ExternalFetchError) throw e;
    throw new ExternalFetchError('network', 'invalid_url');
  }
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const start = Date.now();
      const fetchImpl = await getFetch();
      const res = await fetchImpl(url, { 
        signal: ac.signal,
        headers: opts.headers
      });
      clearTimeout(t);
      if (!res.ok) {
        observeExternal(
          { target: opts.target ?? 'unknown', status: res.status >= 500 ? '5xx' : '4xx' },
          Date.now() - start,
        );
        throw new ExternalFetchError('http', `HTTP_${res.status}`, res.status);
      }
      const out = (await res.json()) as T;
      observeExternal({ target: opts.target ?? 'unknown', status: 'ok' }, Date.now() - start);
      return out;
    } catch (err: unknown) {
      lastErr = err;
      // Distinguish timeout vs other network errors
      if ((err as { name?: string } | undefined)?.name === 'AbortError') {
        observeExternal({ target: opts.target ?? 'unknown', status: 'timeout' }, timeoutMs);
        lastErr = new ExternalFetchError('timeout', 'timeout');
      } else if (err instanceof ExternalFetchError) {
        // already observed
      } else {
        observeExternal({ target: opts.target ?? 'unknown', status: 'network' }, timeoutMs);
        lastErr = new ExternalFetchError('network', 'network_error');
      }
      if (i < retries) {
        await calculateDelay(i);
      }
    }
  }
  throw lastErr;
}


