import { jest } from '@jest/globals';

/**
 * Ensure NLP-first parsers avoid LLM when confidence >= thresholds.
 */
// Mock LLM module to detect any unintended calls
jest.mock('../../src/core/llm.js', () => ({
  callLLM: jest.fn(() => {
    throw new Error('LLM should not be called for high-confidence NLP');
  }),
}));

let parseCityFn: (text: string, ctx?: Record<string, any>, log?: any) => Promise<{
  success: boolean;
  data: { normalized?: string } | null;
  confidence: number;
}>;
let parseODFn: (text: string, ctx?: Record<string, any>, log?: any) => Promise<{
  success: boolean;
  data: { destinationCity?: string } | null;
  confidence: number;
}>;

describe('NLP-first parsing avoids LLM on high confidence', () => {
  beforeAll(async () => {
    process.env.USE_COMPROMISE_DATES = 'false';
    const m = await import('../../src/core/parsers.js');
    parseCityFn = m.parseCity;
    parseODFn = m.parseOriginDestination;
  });

  it('parseCity uses NLP result without LLM', async () => {
    const res = await parseCityFn('from Tel Aviv in August');
    expect(res.success).toBe(true);
    expect(res.data?.normalized).toBe('Tel Aviv');
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('parseOriginDestination uses NLP result without LLM', async () => {
    const res = await parseODFn('going to Paris in June');
    expect(res.success).toBe(true);
    expect(res.data?.destinationCity).toBe('Paris');
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
