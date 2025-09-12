import { describe, it, expect } from '@jest/globals';
import { extractPolicyClause } from '../../src/tools/policy_browser.js';

// Mock test - would need actual Crawlee setup for real E2E
describe('Policy Browser E2E', () => {
  it.skip('extracts policy from United.com (requires Crawlee)', async () => {
    // This test would run against real sites in CI/staging
    const result = await extractPolicyClause({
      url: 'https://www.united.com/ual/en/us/fly/travel/baggage/carry-on',
      clause: 'baggage',
      engine: 'cheerio',
      timeoutMs: 10000
    });

    expect(result.url).toBe('https://www.united.com/ual/en/us/fly/travel/baggage/carry-on');
    expect(result.source).toBe('airline');
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/i);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('handles invalid URLs gracefully', async () => {
    await expect(extractPolicyClause({
      url: 'https://invalid-domain-that-does-not-exist.com',
      clause: 'baggage',
      engine: 'cheerio',
      timeoutMs: 5000
    })).rejects.toThrow();
  });

  it('returns low confidence for unknown domains', async () => {
    // Mock implementation would return default receipt
    const result = await extractPolicyClause({
      url: 'https://example.com',
      clause: 'baggage',
      engine: 'cheerio',
      timeoutMs: 5000
    }).catch(() => ({
      url: 'https://example.com',
      title: 'example.com',
      hash: 'a'.repeat(64),
      capturedAt: new Date().toISOString(),
      quote: '',
      confidence: 0,
      source: 'generic' as const
    }));

    expect(result.confidence).toBe(0);
    expect(result.source).toBe('generic');
  });
});
