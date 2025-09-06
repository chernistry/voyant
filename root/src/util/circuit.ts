import CircuitBreaker from 'opossum';

const breakers = new Map<string, CircuitBreaker<any>>();
const stats = new Map<string, {
  state: 'closed' | 'open' | 'halfOpen';
  opens: number;
  timeouts: number;
  failures: number;
  rejects: number;
  successes: number;
}>();

function getConfig(host: string) {
  const defaultTimeout = Number(process.env.EXT_BREAKER_TIMEOUT_MS || 4000);
  const defaultReset = Number(process.env.EXT_BREAKER_RESET_MS || 15000);
  const defaultErrorPct = Number(process.env.EXT_BREAKER_ERROR_PCT || 50);
  const defaultVolume = Number(process.env.EXT_BREAKER_VOLUME || 10);
  
  // Per-host overrides
  const hostKey = host.replace(/[.-]/g, '_').toUpperCase();
  const timeout = Number(process.env[`BREAK_TIMEOUT_MS_${hostKey}`] || defaultTimeout);
  const resetTimeout = Number(process.env[`BREAK_RESET_MS_${hostKey}`] || defaultReset);
  const errorThresholdPercentage = Number(process.env[`BREAK_ERROR_PCT_${hostKey}`] || defaultErrorPct);
  const volumeThreshold = Number(process.env[`BREAK_VOLUME_${hostKey}`] || defaultVolume);
  
  return {
    timeout,
    resetTimeout,
    errorThresholdPercentage,
    volumeThreshold,
    rollingCountTimeout: 10000, // 10s rolling window
  };
}

function initStats(host: string) {
  if (!stats.has(host)) {
    stats.set(host, {
      state: 'closed',
      opens: 0,
      timeouts: 0,
      failures: 0,
      rejects: 0,
      successes: 0,
    });
  }
}

export function getBreaker(host: string): CircuitBreaker<any> {
  if (!breakers.has(host)) {
    const config = getConfig(host);
    const breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), config);
    
    initStats(host);
    const hostStats = stats.get(host)!;
    
    // Hook up events to metrics
    breaker.on('open', () => {
      hostStats.state = 'open';
      hostStats.opens++;
    });
    
    breaker.on('halfOpen', () => {
      hostStats.state = 'halfOpen';
    });
    
    breaker.on('close', () => {
      hostStats.state = 'closed';
    });
    
    breaker.on('reject', () => {
      hostStats.rejects++;
    });
    
    breaker.on('timeout', () => {
      hostStats.timeouts++;
    });
    
    breaker.on('failure', () => {
      hostStats.failures++;
    });
    
    breaker.on('success', () => {
      hostStats.successes++;
    });
    
    // Set fallback for consistent error handling
    breaker.fallback(() => {
      const error = new Error('Circuit breaker is open');
      error.name = 'CircuitBreakerOpenError';
      throw error;
    });
    
    breakers.set(host, breaker);
  }
  
  return breakers.get(host)!;
}

export async function withBreaker<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const breaker = getBreaker(host);
  return breaker.fire(fn);
}

export function getBreakerStats(host: string) {
  return stats.get(host) || null;
}

export function getAllBreakerStats() {
  const result: Record<string, any> = {};
  for (const [host, hostStats] of stats.entries()) {
    result[host] = { ...hostStats };
  }
  return result;
}
