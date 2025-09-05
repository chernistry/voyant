/* eslint-disable @typescript-eslint/no-explicit-any */
import process from 'node:process';
/**
 * Minimal metrics utility with optional Prometheus exposure.
 * - Set METRICS=prom to enable Prometheus default registry at /metrics
 * - Set METRICS=json to enable lightweight JSON snapshot at /metrics
 */
// Lazy dynamic import to avoid hard dependency during tests/local runs
// Note: avoid type-level imports from 'prom-client' to keep dependency optional
let promClient;
let initPromise;
const MODE = (process.env.METRICS ?? '').toLowerCase();
const IS_PROM = MODE === 'prom' || MODE === 'prometheus';
const IS_JSON = MODE === 'json';
export const metricsEnabled = IS_PROM || IS_JSON;
// JSON fallback counters
let messages = 0;
const externalAgg = new Map(); // key = target
let register;
let counterMessages;
let counterExtReq;
let histExtLatency;
async function ensureProm() {
    if (!IS_PROM)
        return;
    if (initPromise)
        return initPromise;
    initPromise = (async () => {
        const modName = 'prom-client';
        promClient = (await import(modName));
        const { Registry, collectDefaultMetrics, Counter, Histogram, } = promClient;
        register = new Registry();
        collectDefaultMetrics({ register });
        counterMessages = new Counter({
            name: 'messages_total',
            help: 'Total chat messages processed',
            registers: [register],
        });
        counterExtReq = new Counter({
            name: 'external_requests_total',
            help: 'External adapter requests',
            labelNames: ['target', 'status'],
            registers: [register],
        });
        histExtLatency = new Histogram({
            name: 'external_request_latency_ms',
            help: 'Latency of external adapter requests in milliseconds',
            labelNames: ['target', 'status'],
            buckets: [50, 100, 200, 400, 800, 2000, 4000],
            registers: [register],
        });
    })();
    return initPromise;
}
// Kick off initialization without blocking; ignore failure if prom-client is not installed
// no-await-in-loop intentionally avoided here
void ensureProm().catch(() => undefined);
export function incMessages() {
    messages += 1;
    if (counterMessages)
        counterMessages.inc();
}
export function observeExternal(labels, durationMs) {
    if (counterExtReq)
        counterExtReq.inc({
            target: labels.target ?? 'unknown',
            status: labels.status ?? 'unknown',
        });
    if (histExtLatency)
        histExtLatency.observe({ target: labels.target ?? 'unknown', status: labels.status ?? 'unknown' }, durationMs);
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
export async function getPrometheusText() {
    if (!IS_PROM)
        return '';
    await ensureProm();
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
    return { messages_total: messages, external_requests: { targets } };
}
export function metricsMode() {
    if (IS_PROM)
        return 'prom';
    if (IS_JSON)
        return 'json';
    return 'off';
}
