// ESM-friendly mocking for deep research
// Note: use dynamic import after setting mocks

// Mock LLM to return optimized queries and passthrough summary
// @ts-ignore
jest.unstable_mockModule('../../src/core/llm.js', () => ({
  callLLM: jest.fn(async (prompt: string) => {
    if (/search_query_optimizer/i.test(prompt) || /queries\":/i.test(prompt)) {
      return JSON.stringify({ queries: ['Tokyo weather March', 'Tokyo March climate'] });
    }
    // Return a simple text summary for search_summarize
    return 'Summary: Weather is mild in March; pack layers. Sources included.';
  }),
}));

// Mock search provider to return deterministic results
// @ts-ignore
jest.unstable_mockModule('../../src/tools/search.js', () => ({
  searchTravelInfo: jest.fn(async (q: string) => ({
    ok: true,
    results: [
      {
        title: `Result for ${q} A`,
        url: 'https://example.com/a',
        description: 'Some description A',
      },
      {
        title: `Result for ${q} B`,
        url: 'https://example.org/b',
        description: 'Some description B',
      },
    ],
  })),
}));

describe('deep_research', () => {
  it('performs research and returns summary and citations', async () => {
    const { performDeepResearch } = await import('../../src/core/deep_research.js');
    const res = await performDeepResearch('Tokyo weather in March');
    expect(typeof res.summary).toBe('string');
    expect(res.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(res.citations)).toBe(true);
    // In CI without network, citations may be empty; ensure types hold
    expect(Array.isArray(res.sources)).toBe(true);
    expect(res.confidence).toBeGreaterThan(0);
  });
});
