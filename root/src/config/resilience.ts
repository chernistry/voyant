import { CircuitBreakerConfigSchema, type CircuitBreakerConfig } from '../core/circuit-breaker.js';
import { RateLimiterConfigSchema, type RateLimiterConfig } from '../core/rate-limiter.js';

export const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = CircuitBreakerConfigSchema.parse({
  failureThreshold: Number(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5,
  successThreshold: Number(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) || 3,
  timeout: Number(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000,
  resetTimeout: Number(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT) || 30000,
  monitoringPeriod: Number(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD) || 10000
});

export const RATE_LIMITER_CONFIG: RateLimiterConfig = RateLimiterConfigSchema.parse({
  maxConcurrent: Number(process.env.RATE_LIMITER_MAX_CONCURRENT) || 10,
  minTime: Number(process.env.RATE_LIMITER_MIN_TIME) || 1000,
  reservoir: Number(process.env.RATE_LIMITER_RESERVOIR) || 100,
  reservoirRefreshAmount: Number(process.env.RATE_LIMITER_RESERVOIR_REFRESH_AMOUNT) || 10,
  reservoirRefreshInterval: Number(process.env.RATE_LIMITER_RESERVOIR_REFRESH_INTERVAL) || 60000
});
