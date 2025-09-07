import { safeExtractJson } from '../../src/core/llm.js';

describe('Content Classification JSON Parsing', () => {
  it('should extract valid JSON from text', () => {
    const text = 'Here is the result: {"content_type": "travel", "is_explicit_search": false} - done';
    const result = safeExtractJson(text);
    
    expect(result).toEqual({
      content_type: 'travel',
      is_explicit_search: false
    });
  });

  it('should return undefined for text without JSON', () => {
    const text = 'This is just plain text without any JSON';
    const result = safeExtractJson(text);
    
    expect(result).toBeUndefined();
  });

  it('should return undefined for malformed JSON', () => {
    const text = 'Here is broken JSON: {content_type: "travel", invalid} - done';
    const result = safeExtractJson(text);
    
    expect(result).toBeUndefined();
  });

  it('should extract nested JSON objects', () => {
    const text = 'Response: {"content_type": "budget", "details": {"cost": 100}} end';
    const result = safeExtractJson(text);
    
    expect(result).toEqual({
      content_type: 'budget',
      details: { cost: 100 }
    });
  });
});
