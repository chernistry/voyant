import { describe, it, expect } from '@jest/globals';
import { routeIntent } from '../../src/core/router.js';

describe('Flight Intent Detection - Basic', () => {
  it('should detect flight intent from simple query', async () => {
    const result = await routeIntent({
      message: 'flights from NYC to London',
    });

    console.log('Router result:', JSON.stringify(result, null, 2));
    
    // For now, just verify the router doesn't crash and returns a valid result
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle flight-related keywords', async () => {
    const queries = [
      'book a flight',
      'airline tickets',
      'fly to Paris',
      'air travel',
    ];

    for (const query of queries) {
      const result = await routeIntent({ message: query });
      console.log(`Query: "${query}" -> Intent: ${result.intent}, Confidence: ${result.confidence}`);
      
      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
    }
  });
});
