import { CircuitBreaker, CircuitBreakerState } from '../../src/core/circuit-breaker.js';
import { RateLimiter } from '../../src/core/rate-limiter.js';
import { searchTravelInfo } from '../../src/tools/search.js';
import { searchPOIs } from '../../src/tools/opentripmap.js';
import nock from 'nock';

describe('Resilience Layer Integration', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Circuit Breaker Integration', () => {
    it('should protect against cascading failures in Brave Search', async () => {
      // Mock Brave Search to always fail
      nock('https://search.brave.com')
        .persist()
        .post('/api/v1/web/search')
        .reply(500, 'Internal Server Error');

      const results = [];
      
      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        const result = await searchTravelInfo('test query');
        results.push(result);
      }

      // First few should fail normally, then circuit breaker should kick in
      expect(results.some(r => !r.ok && r.reason === 'circuit_breaker_open')).toBe(true);
    });

    it('should protect against cascading failures in OpenTripMap', async () => {
      // Mock OpenTripMap to always fail
      nock('https://api.opentripmap.com')
        .persist()
        .get(/\/0\.1\/en\/places\/radius/)
        .reply(500, 'Internal Server Error');

      const results = [];
      
      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        const result = await searchPOIs({ lat: 40.7128, lon: -74.0060 });
        results.push(result);
      }

      // Should eventually get circuit breaker errors
      expect(results.some(r => !r.ok && r.reason === 'circuit_breaker_open')).toBe(true);
    });

    it('should recover after successful requests', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 1000,
        resetTimeout: 100, // Short timeout for test
        monitoringPeriod: 5000
      }, 'test');

      const failingFn = jest.fn().mockRejectedValue(new Error('test error'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trigger circuit breaker to open
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should transition to HALF_OPEN and then CLOSED on success
      const result = await circuitBreaker.execute(successFn);
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should limit concurrent requests', async () => {
      const rateLimiter = new RateLimiter({
        maxConcurrent: 2,
        minTime: 0,
        reservoir: 10,
        reservoirRefreshAmount: 5,
        reservoirRefreshInterval: 1000
      });

      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));

      // Start 3 concurrent requests
      const promises = [
        rateLimiter.execute(slowFn),
        rateLimiter.execute(slowFn),
        rateLimiter.execute(slowFn)
      ];

      // Third request should be rejected
      const results = await Promise.allSettled(promises);
      const rejectedCount = results.filter(r => r.status === 'rejected').length;
      expect(rejectedCount).toBe(1);
    });

    it('should enforce minimum time between requests', async () => {
      const rateLimiter = new RateLimiter({
        maxConcurrent: 10,
        minTime: 100,
        reservoir: 10,
        reservoirRefreshAmount: 5,
        reservoirRefreshInterval: 1000
      });

      const fastFn = () => Promise.resolve('fast');

      // First request should succeed
      const result1 = await rateLimiter.execute(fastFn);
      expect(result1).toBe('fast');

      // Immediate second request should fail
      await expect(rateLimiter.execute(fastFn)).rejects.toThrow('Rate limit exceeded');

      // After waiting, should succeed
      await new Promise(resolve => setTimeout(resolve, 150));
      const result2 = await rateLimiter.execute(fastFn);
      expect(result2).toBe('fast');
    });

    it('should refill tokens over time', async () => {
      const rateLimiter = new RateLimiter({
        maxConcurrent: 10,
        minTime: 0,
        reservoir: 2,
        reservoirRefreshAmount: 1,
        reservoirRefreshInterval: 100
      });

      const quickFn = () => Promise.resolve('quick');

      // Consume all tokens
      await rateLimiter.execute(quickFn);
      await rateLimiter.execute(quickFn);

      // Should be rate limited
      await expect(rateLimiter.execute(quickFn)).rejects.toThrow('Rate limit exceeded');

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should work again
      const result = await rateLimiter.execute(quickFn);
      expect(result).toBe('quick');
    });
  });

  describe('End-to-End Resilience', () => {
    it('should handle external service failures gracefully', async () => {
      // Mock all external services to fail initially
      nock('https://search.brave.com')
        .post('/api/v1/web/search')
        .times(3)
        .reply(500, 'Service Unavailable')
        .post('/api/v1/web/search')
        .reply(200, {
          web: {
            results: [
              {
                title: 'Test Result',
                url: 'https://example.com',
                description: 'Test description'
              }
            ]
          }
        });

      // First few requests should fail, then succeed
      const results = [];
      for (let i = 0; i < 4; i++) {
        const result = await searchTravelInfo('test query');
        results.push(result);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should have some failures and eventual success
      const failures = results.filter(r => !r.ok).length;
      const successes = results.filter(r => r.ok).length;
      
      expect(failures).toBeGreaterThan(0);
      expect(successes).toBeGreaterThan(0);
    });

    it('should prevent abuse through rate limiting', async () => {
      // Mock successful responses
      nock('https://api.opentripmap.com')
        .persist()
        .get(/\/0\.1\/en\/places\/radius/)
        .reply(200, {
          features: [
            {
              properties: {
                xid: 'test123',
                name: 'Test POI',
                kinds: 'interesting_places'
              },
              geometry: {
                coordinates: [-74.0060, 40.7128]
              }
            }
          ]
        });

      // Make rapid requests
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(searchPOIs({ lat: 40.7128, lon: -74.0060 }));
      }

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected').length;
      
      // Some requests should be rate limited
      expect(failures).toBeGreaterThan(0);
    });
  });
});
