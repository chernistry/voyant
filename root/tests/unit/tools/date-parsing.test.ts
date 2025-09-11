import { convertToAmadeusDate } from '../../../src/tools/amadeus_flights.js';

// Mock the LLM and prompts dependencies
jest.mock('../../../src/core/llm.js', () => ({
  callLLM: jest.fn().mockResolvedValue('{"confidence": 0.3, "dates": null}')
}));

jest.mock('../../../src/core/prompts.js', () => ({
  getPrompt: jest.fn().mockResolvedValue('mock prompt')
}));

describe('Date Parsing Fix', () => {
  it('should parse DD-MM-YYYY format correctly', async () => {
    const result = await convertToAmadeusDate('12-10-2025');
    expect(result).toBe('2025-10-12'); // October 12th, not December 10th
  });

  it('should parse other DD-MM-YYYY dates correctly', async () => {
    const result = await convertToAmadeusDate('25-12-2025');
    expect(result).toBe('2025-12-25'); // December 25th
  });

  it('should handle single digit days and months', async () => {
    const result = await convertToAmadeusDate('5-3-2025');
    expect(result).toBe('2025-03-05'); // March 5th
  });

  it('should still handle YYYY-MM-DD format', async () => {
    const result = await convertToAmadeusDate('2025-10-12');
    expect(result).toBe('2025-10-12'); // Should pass through unchanged
  });
});
