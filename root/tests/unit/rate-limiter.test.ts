import { RateLimiter, RateLimiterError } from '../../src/core/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  
  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxConcurrent: 2,
      minTime: 100,
      reservoir: 5,
      reservoirRefreshAmount: 2,
      reservoirRefreshInterval: 1000
    });
  });

  describe('token bucket', () => {
    it('should allow requests when tokens available', async () => {
      const result = await rateLimiter.acquire();
      expect(result).toBe(true);
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.tokens).toBe(4); // Started with 5, consumed 1
    });

    it('should reject requests when no tokens', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }
      
      const result = await rateLimiter.acquire();
      expect(result).toBe(false);
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }
      
      // Wait for refill interval
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const result = await rateLimiter.acquire();
      expect(result).toBe(true);
    });
  });

  describe('concurrent requests', () => {
    it('should track concurrent requests', async () => {
      await rateLimiter.acquire();
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.concurrentRequests).toBe(1);
    });

    it('should reject when max concurrent reached', async () => {
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      
      const result = await rateLimiter.acquire();
      expect(result).toBe(false);
    });

    it('should allow requests after release', async () => {
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      
      rateLimiter.release();
      
      // Wait for minimum time
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = await rateLimiter.acquire();
      expect(result).toBe(true);
    });
  });

  describe('minimum time between requests', () => {
    it('should enforce minimum time', async () => {
      await rateLimiter.acquire();
      
      // Try immediately - should fail
      const result = await rateLimiter.acquire();
      expect(result).toBe(false);
    });

    it('should allow requests after minimum time', async () => {
      await rateLimiter.acquire();
      
      // Wait for minimum time
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = await rateLimiter.acquire();
      expect(result).toBe(true);
    });
  });

  describe('execute wrapper', () => {
    it('should execute function when rate limit allows', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await rateLimiter.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw RateLimiterError when limit exceeded', async () => {
      // Consume all tokens and concurrent slots
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }
      
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await expect(rateLimiter.execute(mockFn)).rejects.toThrow(RateLimiterError);
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should release concurrent slot after execution', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await rateLimiter.execute(mockFn);
      
      // Wait for minimum time
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = await rateLimiter.execute(mockFn);
      expect(result).toBe('success');
    });

    it('should release concurrent slot even on error', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      try {
        await rateLimiter.execute(mockFn);
      } catch (error) {
        // Expected
      }
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.concurrentRequests).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should provide accurate metrics', async () => {
      await rateLimiter.acquire();
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.tokens).toBe(4);
      expect(metrics.concurrentRequests).toBe(1);
      expect(metrics.lastRequestTime).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      // Consume some tokens and concurrent slots
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      
      rateLimiter.reset();
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.tokens).toBe(5);
      expect(metrics.concurrentRequests).toBe(0);
      expect(metrics.lastRequestTime).toBe(0);
    });
  });
});
