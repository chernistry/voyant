import { z } from 'zod';

export const RateLimiterConfigSchema = z.object({
  maxConcurrent: z.number().min(1).default(10),
  minTime: z.number().min(0).default(1000),
  reservoir: z.number().min(1).default(100),
  reservoirRefreshAmount: z.number().min(1).default(10),
  reservoirRefreshInterval: z.number().min(1000).default(60000)
});

export type RateLimiterConfig = z.infer<typeof RateLimiterConfigSchema>;

export class RateLimiterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterError';
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private concurrentRequests = 0;
  private lastRequestTime = 0;

  constructor(private readonly config: RateLimiterConfig) {
    this.tokens = config.reservoir;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<boolean> {
    // Check concurrent limit
    if (this.concurrentRequests >= this.config.maxConcurrent) {
      return false;
    }

    // Check minimum time between requests
    const now = Date.now();
    if (now - this.lastRequestTime < this.config.minTime) {
      return false;
    }

    // Refill tokens based on time elapsed
    this.refillTokens(now);

    // Check if tokens available
    if (this.tokens < 1) {
      return false;
    }

    // Consume token and track request
    this.tokens--;
    this.concurrentRequests++;
    this.lastRequestTime = now;

    return true;
  }

  release(): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!(await this.acquire())) {
      throw new RateLimiterError('Rate limit exceeded');
    }

    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private refillTokens(now: number): void {
    const timeSinceLastRefill = now - this.lastRefill;
    const refillIntervals = Math.floor(timeSinceLastRefill / this.config.reservoirRefreshInterval);
    
    if (refillIntervals > 0) {
      const tokensToAdd = refillIntervals * this.config.reservoirRefreshAmount;
      this.tokens = Math.min(this.config.reservoir, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getMetrics() {
    return {
      tokens: this.tokens,
      concurrentRequests: this.concurrentRequests,
      lastRefill: this.lastRefill,
      lastRequestTime: this.lastRequestTime
    };
  }

  reset(): void {
    this.tokens = this.config.reservoir;
    this.lastRefill = Date.now();
    this.concurrentRequests = 0;
    this.lastRequestTime = 0;
  }
}
