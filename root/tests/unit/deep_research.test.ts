import { jest } from '@jest/globals';

// Mock LLM to return optimized queries and passthrough summary
jest.mock('../../src/core/llm.js', () => ({
  callLLM: jest.fn(async (prompt: string) => {
    if (/search_query_optimizer/i.test(prompt) || /queries\":/i.test(prompt)) {
      return JSON.stringify({
        queries: ['Tokyo weather March', 'Tokyo March climate'],
      });
    }
    return 'Summary: Weather is mild in March; pack layers. Sources included.';
  }),
}));

// Mock search provider to return deterministic results
jest.mock('../../src/tools/search.js', () => ({
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
    const { performDeepResearch } =
      await import('../../src/core/deep_research.js');
    const res = await performDeepResearch('Tokyo weather in March');
    expect(res).toMatchObject({
      summary: expect.any(String),
      citations: expect.arrayContaining([
        expect.objectContaining({
          source: expect.any(String),
          url: expect.any(String),
          confidence: expect.any(Number),
        }),
      ]),
      confidence: expect.any(Number),
      sources: expect.any(Array),
    });
  });
});
