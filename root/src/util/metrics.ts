/* eslint-disable @typescript-eslint/no-explicit-any */
import process from 'node:process';
import { getAllBreakerStats } from './circuit.js';
import { getAllLimiterStats } from './limiter.js';

/**
 * Minimal metrics utility with optional Prometheus exposure.
 * - Set METRICS=prom to enable Prometheus default registry at /metrics
 * - Set METRICS=json to enable lightweight JSON snapshot at /metrics
 */
// Lazy dynamic import to avoid hard dependency during tests/local runs
// Note: avoid type-level imports from 'prom-client' to keep dependency optional
let promClient: any | undefined;
let initPromise: Promise<void> | undefined;

const MODE = (process.env.METRICS ?? '').toLowerCase();
const IS_PROM = MODE === 'prom' || MODE === 'prometheus';
const IS_JSON = MODE === 'json';

export const metricsEnabled = IS_PROM || IS_JSON;

// JSON fallback counters
let messages = 0;

// Lightweight JSON aggregation for external requests (works even when METRICS=off)
type ExtAgg = {
  total: number;
  byStatus: Record<string, number>; // ok, 4xx, 5xx, timeout, network, unknown
  latency: { count: number; sum: number; min: number; max: number };
};
const externalAgg = new Map<string, ExtAgg>(); // key = target

type Labels = { target?: string; status?: string };

// Prometheus metrics (conditionally initialized)
type CounterT = { inc: (labels?: Record<string, string>) => void };
type HistogramT = { observe: (labels: Record<string, string>, v: number) => void };
type GaugeT = { set: (labels: Record<string, string>, v: number) => void };
type RegistryT = { metrics: () => string };
let register: RegistryT | undefined;
let counterMessages: CounterT | undefined;
let counterExtReq: CounterT | undefined;
let histExtLatency: HistogramT | undefined;
let gaugeBreakerState: GaugeT | undefined;
let counterBreakerEvents: CounterT | undefined;
let counterRateLimitThrottled: CounterT | undefined;

async function ensureProm(): Promise<void> {
  if (!IS_PROM) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const modName = 'prom-client';
    promClient = (await import(modName)) as any;
    const {
      Registry,
      collectDefaultMetrics,
      Counter,
      Histogram,
      Gauge,
    } = promClient as any;
    register = new Registry() as RegistryT;
    collectDefaultMetrics({ register });
    counterMessages = new Counter({
      name: 'messages_total',
      help: 'Total chat messages processed',
      registers: [register],
    }) as CounterT;
    counterExtReq = new Counter({
      name: 'external_requests_total',
      help: 'External adapter requests',
      labelNames: ['target', 'status'],
      registers: [register],
    }) as CounterT;
    histExtLatency = new Histogram({
      name: 'external_request_latency_ms',
      help: 'Latency of external adapter requests in milliseconds',
      labelNames: ['target', 'status'],
      buckets: [50, 100, 200, 400, 800, 2000, 4000],
      registers: [register],
    }) as HistogramT;
    gaugeBreakerState = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 0.5=halfOpen, 1=open)',
      labelNames: ['target'],
      registers: [register],
    }) as GaugeT;
    counterBreakerEvents = new Counter({
      name: 'circuit_breaker_events_total',
      help: 'Circuit breaker events',
      labelNames: ['target', 'type'],
      registers: [register],
    }) as CounterT;
    counterRateLimitThrottled = new Counter({
      name: 'rate_limit_throttled_total',
      help: 'Rate limit throttled requests',
      labelNames: ['target'],
      registers: [register],
    }) as CounterT;
  })();
  return initPromise;
}

// Kick off initialization without blocking; ignore failure if prom-client is not installed
// no-await-in-loop intentionally avoided here
void ensureProm().catch(() => undefined);

export function incMessages() {
  messages += 1;
  if (counterMessages) counterMessages.inc();
}

export function observeExternal(labels: Labels, durationMs: number) {
  if (counterExtReq)
    counterExtReq.inc({
      target: labels.target ?? 'unknown',
      status: labels.status ?? 'unknown',
    });
  if (histExtLatency)
    histExtLatency.observe(
      { target: labels.target ?? 'unknown', status: labels.status ?? 'unknown' },
      durationMs,
    );

  // Always update JSON aggregation (even when not in JSON mode), so /metrics can still respond
  const target = labels.target ?? 'unknown';
  const status = labels.status ?? 'unknown';
  const prev = externalAgg.get(target) ?? {
    total: 0,
    byStatus: {},
    latency: { count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: 0 },
  };
  prev.total += 1;
  prev.byStatus[status] = (prev.byStatus[status] ?? 0) + 1;
  prev.latency.count += 1;
  prev.latency.sum += durationMs;
  prev.latency.min = Math.min(prev.latency.min, durationMs);
  prev.latency.max = Math.max(prev.latency.max, durationMs);
  externalAgg.set(target, prev);
}

export function updateBreakerMetrics() {
  if (!gaugeBreakerState || !counterBreakerEvents) return;
  
  const breakerStats = getAllBreakerStats();
  for (const [target, stats] of Object.entries(breakerStats)) {
    const stateValue = stats.state === 'open' ? 1 : stats.state === 'halfOpen' ? 0.5 : 0;
    gaugeBreakerState.set({ target }, stateValue);
  }
}

/**
 * Record IRROPS processing metrics
 */
export function observeIrrops(
  disruptionType: string,
  optionsGenerated: number,
  durationMs: number,
  success: boolean = true
) {
  observeExternal(
    {
      target: 'irrops',
      status: success ? 'ok' : 'error',
      // Use target field to include disruption type for now
      // In production, would extend labels to include disruption_type
    },
    durationMs
  );
  
  // Could add specific IRROPS counters here if needed
  // For now, using existing external request pattern
}

/**
 * Record policy browser extraction metrics
 */
export function observePolicyBrowser(
  engine: 'playwright' | 'cheerio',
  durationMs: number,
  success: boolean = true,
  confidence?: number
) {
  observeExternal(
    {
      target: 'policy_browser',
      status: success ? 'ok' : 'error',
    },
    durationMs
  );
  
  // Log confidence for monitoring extraction quality
  if (confidence !== undefined) {
    console.log(`policy_browser_confidence: ${confidence.toFixed(2)} (${engine})`);
  }
}

export function incBreakerEvent(target: string, type: string) {
  if (counterBreakerEvents) {
    counterBreakerEvents.inc({ target, type });
  }
}

export function incRateLimitThrottled(target: string) {
  if (counterRateLimitThrottled) {
    counterRateLimitThrottled.inc({ target });
  }
}

export async function getPrometheusText(): Promise<string> {
  if (!IS_PROM) return '';
  await ensureProm();
  updateBreakerMetrics();
  return register ? register.metrics() : '';
}

export function snapshot() {
  const targets = Array.from(externalAgg.entries()).map(([target, agg]) => ({
    target,
    total: agg.total,
    byStatus: agg.byStatus,
    latency: {
      count: agg.latency.count,
      avg_ms: agg.latency.count > 0 ? Number((agg.latency.sum / agg.latency.count).toFixed(1)) : 0,
      min_ms: agg.latency.count > 0 ? agg.latency.min : 0,
      max_ms: agg.latency.max,
    },
  }));
  
  return { 
    messages_total: messages, 
    external_requests: { targets },
    breaker: { byTarget: getAllBreakerStats() },
    rate_limit: { byTarget: getAllLimiterStats() }
  };
}

export function metricsMode(): 'prom' | 'json' | 'off' {
  if (IS_PROM) return 'prom';
  if (IS_JSON) return 'json';
  return 'off';
}
