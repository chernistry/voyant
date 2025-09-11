import { jest } from '@jest/globals';
import nock from 'nock';
import { fetchJSON, ExternalFetchError } from '../../src/util/fetch.js';
import { getBreaker, getBreakerStats, resetAllBreakers } from '../../src/util/circuit.js';
import { getLimiter, getLimiterStats } from '../../src/util/limiter.js';

describe('Circuit Breaker and Rate Limiting', () => {
  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
    resetAllBreakers();
    // Reset environment variables
    delete process.env.EXT_BREAKER_ERROR_PCT;
    delete process.env.EXT_BREAKER_VOLUME;
    delete process.env.EXT_RATE_MIN_TIME_MS;
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after error threshold', async () => {
      // Set low thresholds for testing
      process.env.EXT_BREAKER_ERROR_PCT = '1';
      process.env.EXT_BREAKER_VOLUME = '1';
      
      const host = 'api.test-service-cb1.com';
      
      // Mock failing responses
      nock(`https://${host}`)
        .get('/test')
        .reply(500, 'Server Error')
        .persist();

      // First request should fail and trigger circuit breaker
      await expect(fetchJSON(`https://${host}/test`, { 
        target: 'test-service',
        retries: 0 
      })).rejects.toThrow();

      // Wait a bit for circuit breaker to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second request should fail fast due to open circuit
      await expect(fetchJSON(`https://${host}/test`, { 
        target: 'test-service',
        retries: 0 
      })).rejects.toThrow('circuit_open');

      const stats = getBreakerStats(host);
      expect(stats?.state).toBe('open');
      expect(stats?.opens).toBeGreaterThan(0);
    }, 10000);

    it('should track breaker statistics', async () => {
      const host = 'api.stats-test-cb2.com';
      
      nock(`https://${host}`)
        .get('/success')
        .reply(200, { data: 'success' });

      await fetchJSON(`https://${host}/success`, { 
        target: 'stats-test',
        retries: 0 
      });

      const stats = getBreakerStats(host);
      expect(stats?.successes).toBeGreaterThan(0);
      expect(stats?.state).toBe('closed');
    });
  });

  describe('Rate Limiter', () => {
    it('should throttle requests based on minTime', async () => {
      process.env.EXT_RATE_MIN_TIME_MS = '500';
      
      const host = 'api.rate-test-rl1.com';
      
      nock(`https://${host}`)
        .get('/test')
        .reply(200, { data: 'test' })
        .persist();

      const start = Date.now();
      
      // Make two requests that should be throttled
      const promises = [
        fetchJSON(`https://${host}/test`, { target: 'rate-test', retries: 0 }),
        fetchJSON(`https://${host}/test`, { target: 'rate-test', retries: 0 })
      ];

      await Promise.all(promises);
      
      const duration = Date.now() - start;
      // Second request should be delayed by at least minTime
      expect(duration).toBeGreaterThan(400);
    }, 10000);

    it('should track limiter statistics', async () => {
      const host = 'api.limiter-stats-rl2.com';
      
      nock(`https://${host}`)
        .get('/test')
        .reply(200, { data: 'test' });

      const limiter = getLimiter(host);
      expect(limiter).toBeDefined();
      
      const stats = getLimiterStats(host);
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('running');
    });
  });

  describe('Integration', () => {
    it('should handle circuit breaker open with rate limiting', async () => {
      process.env.EXT_BREAKER_ERROR_PCT = '1';
      process.env.EXT_BREAKER_VOLUME = '1';
      process.env.EXT_RATE_MIN_TIME_MS = '100';
      
      const host = 'api.integration-test-int1.com';
      
      nock(`https://${host}`)
        .get('/fail')
        .reply(500, 'Server Error')
        .persist();

      // First request fails and opens circuit
      await expect(fetchJSON(`https://${host}/fail`, { 
        target: 'integration-test',
        retries: 0 
      })).rejects.toThrow();

      // Wait for circuit to open
      await new Promise(resolve => setTimeout(resolve, 100));

      // Subsequent requests should fail fast
      await expect(fetchJSON(`https://${host}/fail`, { 
        target: 'integration-test',
        retries: 0 
      })).rejects.toThrow('circuit_open');
    }, 10000);

    it('should preserve existing retry behavior', async () => {
      // Disable circuit breaker for this test by setting very high thresholds
      process.env.EXT_BREAKER_ERROR_PCT = '99';
      process.env.EXT_BREAKER_VOLUME = '100';
      
      const host = 'api.retry-test-int2.com';
      
      // Mock server error that should trigger retry
      nock(`https://${host}`)
        .get('/retry')
        .reply(500, 'Server Error')
        .get('/retry')
        .reply(200, { data: 'success' });

      const result = await fetchJSON(`https://${host}/retry`, { 
        target: 'retry-test',
        retries: 1 
      });

      expect(result).toEqual({ data: 'success' });
    });

    it('should not retry 4xx errors except 429', async () => {
      // Disable circuit breaker for this test
      process.env.EXT_BREAKER_ERROR_PCT = '99';
      process.env.EXT_BREAKER_VOLUME = '100';
      
      const host = 'api.no-retry-test-int3.com';
      
      nock(`https://${host}`)
        .get('/notfound')
        .reply(404, 'Not Found');

      await expect(fetchJSON(`https://${host}/notfound`, { 
        target: 'no-retry-test',
        retries: 2 
      })).rejects.toThrow('HTTP_404');
    });
  });
});
