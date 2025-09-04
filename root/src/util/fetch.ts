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
const MAX_DELAY = 10000; // Increased for rate-limited APIs
const JITTER_FACTOR = 0.25;

async function calculateDelay(attempt: number, retryAfter?: number): Promise<void> {
  // If server provides Retry-After, respect it with small jitter
  if (retryAfter) {
    const jitter = retryAfter * 0.1 * (Math.random() * 2 - 1); // 10% jitter
    const totalDelay = Math.max(100, (retryAfter * 1000) + jitter);
    await delay(Math.min(totalDelay, MAX_DELAY));
    return;
  }
  
  // Standard exponential backoff with jitter
  const expDelay = BASE_DELAY * Math.pow(1.5, attempt);
  const jitter = expDelay * JITTER_FACTOR * (Math.random() * 2 - 1);
  const totalDelay = Math.min(expDelay + jitter, MAX_DELAY);
  await delay(totalDelay);
}

/**
 * Fetches JSON with timeout and exponential backoff retry with jitter.
 * Respects X-Retry-After headers for rate-limited APIs.
 * @param url Request URL
 * @param opts Optional timeout and retry count
 */
export async function fetchJSON<T = unknown>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; target?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const retries = opts.retries ?? 3;
  const target = opts.target ?? 'unknown';
  
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
    const start = Date.now(); // Move start time here
    
    try {
      const fetchImpl = await getFetch();
      
      console.log(`🌐 [${target}] Attempt ${i + 1}/${retries + 1}: ${url.length > 100 ? url.slice(0, 100) + '...' : url}`);
      
      const res = await fetchImpl(url, { 
        signal: ac.signal,
        headers: opts.headers
      });
      
      clearTimeout(t);
      const duration = Date.now() - start;
      
      console.log(`📡 [${target}] Response: ${res.status} ${res.statusText} (${duration}ms)`);
      
      if (!res.ok) {
        const retryAfter = res.headers.get('retry-after') || res.headers.get('x-retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        
        console.log(`❌ [${target}] HTTP ${res.status}: ${res.statusText}${retryAfterSeconds ? `, retry-after: ${retryAfterSeconds}s` : ''}`);
        
        // Log response headers for debugging
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        console.log(`📋 [${target}] Response headers:`, headers);
        
        // Try to read error response body
        try {
          const errorText = await res.text();
          if (errorText) {
            console.log(`📄 [${target}] Error response body:`, errorText.slice(0, 500));
          }
        } catch (bodyErr) {
          console.log(`📄 [${target}] Could not read error response body:`, bodyErr);
        }
        
        observeExternal(
          { target, status: res.status >= 500 ? '5xx' : '4xx' },
          duration,
        );
        
        const error = new ExternalFetchError('http', `HTTP_${res.status}`, res.status);
        
        // For rate limits (429) or server errors (5xx), retry with backoff
        if ((res.status === 429 || res.status >= 500) && i < retries) {
          console.log(`🔄 [${target}] Retrying after ${res.status} error (attempt ${i + 1}/${retries + 1})`);
          lastErr = error;
          await calculateDelay(i, retryAfterSeconds);
          continue;
        }
        
        throw error;
      }
      
      let responseText: string;
      try {
        responseText = await res.text();
      } catch (textErr) {
        console.log(`❌ [${target}] Failed to read response text:`, textErr);
        throw new ExternalFetchError('network', 'response_read_error');
      }
      
      let out: T;
      try {
        out = JSON.parse(responseText) as T;
      } catch (jsonErr) {
        console.log(`❌ [${target}] JSON parse error. Response text (first 500 chars):`, responseText.slice(0, 500));
        throw new ExternalFetchError('network', 'json_parse_error');
      }
      
      console.log(`✅ [${target}] Success: ${responseText.length} chars, ${duration}ms`);
      observeExternal({ target, status: 'ok' }, duration);
      return out;
      
    } catch (err: unknown) {
      clearTimeout(t);
      const duration = Date.now() - start;
      lastErr = err;
      
      // Distinguish timeout vs other network errors
      if ((err as { name?: string } | undefined)?.name === 'AbortError') {
        console.log(`⏰ [${target}] Request timeout after ${timeoutMs}ms`);
        observeExternal({ target, status: 'timeout' }, timeoutMs);
        lastErr = new ExternalFetchError('timeout', 'timeout');
      } else if (err instanceof ExternalFetchError) {
        console.log(`🔍 [${target}] ExternalFetchError: ${err.kind} - ${err.message}`);
        // HTTP errors already handled above, don't retry client errors (4xx except 429)
        if (err.kind === 'http' && err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
      } else {
        console.log(`🌐 [${target}] Network error:`, {
          name: err instanceof Error ? err.name : 'Unknown',
          message: err instanceof Error ? err.message : String(err),
          code: (err as any)?.code,
          errno: (err as any)?.errno,
          syscall: (err as any)?.syscall
        });
        observeExternal({ target, status: 'network' }, duration);
        lastErr = new ExternalFetchError('network', 'network_error');
      }
      
      if (i < retries) {
        console.log(`🔄 [${target}] Retrying after error (attempt ${i + 1}/${retries + 1})`);
        await calculateDelay(i);
      }
    }
  }
  
  console.log(`💥 [${target}] All ${retries + 1} attempts failed`);
  throw lastErr;
}


