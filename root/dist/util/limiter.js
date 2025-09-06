import Bottleneck from 'bottleneck';
const pools = new Map();
function getConfig(host) {
    const defaultMinTime = Number(process.env.EXT_RATE_MIN_TIME_MS || 200);
    const defaultMaxConcurrency = Number(process.env.EXT_RATE_MAX_CONCURRENCY || 2);
    // Per-host overrides
    const hostKey = host.replace(/[.-]/g, '_').toUpperCase();
    const minTime = Number(process.env[`RATE_MIN_MS_${hostKey}`] || defaultMinTime);
    const maxConcurrent = Number(process.env[`RATE_MAX_CONC_${hostKey}`] || defaultMaxConcurrency);
    return { minTime, maxConcurrent };
}
export function getLimiter(host) {
    if (!pools.has(host)) {
        const config = getConfig(host);
        const limiter = new Bottleneck({
            minTime: config.minTime,
            maxConcurrent: config.maxConcurrent,
        });
        pools.set(host, limiter);
    }
    return pools.get(host);
}
export async function scheduleWithLimit(host, fn) {
    return getLimiter(host).schedule(() => fn());
}
export function getLimiterStats(host) {
    const limiter = pools.get(host);
    if (!limiter)
        return null;
    return {
        queued: limiter.queued(),
        running: limiter.running(),
    };
}
export function getAllLimiterStats() {
    const stats = {};
    for (const [host, limiter] of pools.entries()) {
        stats[host] = {
            queued_current: limiter.queued(),
            running_current: limiter.running(),
        };
    }
    return stats;
}
