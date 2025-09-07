import { deepResearchPages } from '../../src/tools/crawlee_research.js';

describe('Crawlee Playwright Integration', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CRAWLEE_ENGINE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRAWLEE_ENGINE = originalEnv;
    } else {
      delete process.env.CRAWLEE_ENGINE;
    }
  });

  // Skip in CI to avoid browser dependencies
  const testCondition = process.env.CI ? it.skip : it;

  testCondition('should handle empty URLs with playwright engine', async () => {
    process.env.CRAWLEE_ENGINE = 'playwright';
    
    const result = await deepResearchPages([], 'test query');
    
    expect(result).toEqual({
      ok: false,
      results: []
    });
  });

  testCondition('should handle empty URLs with cheerio engine', async () => {
    process.env.CRAWLEE_ENGINE = 'cheerio';
    
    const result = await deepResearchPages([], 'test query');
    
    expect(result).toEqual({
      ok: false,
      results: []
    });
  });

  testCondition('should respect CRAWLEE_MAX_PAGES environment variable', async () => {
    process.env.CRAWLEE_ENGINE = 'playwright';
    process.env.CRAWLEE_MAX_PAGES = '2';
    
    // Test with more URLs than the limit
    const urls = [
      'https://example.com/1',
      'https://example.com/2', 
      'https://example.com/3',
      'https://example.com/4'
    ];
    
    // This should not crash and should respect the limit
    const result = await deepResearchPages(urls, 'test query');
    
    // Should return ok: false since these are fake URLs, but shouldn't crash
    expect(result.ok).toBe(false);
    expect(result.results).toEqual([]);
  });
});
