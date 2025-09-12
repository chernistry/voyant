import { describe, it, expect } from '@jest/globals';
import { rankOptions } from '../../src/core/option_ranker.js';
import type { IrropsOption } from '../../src/schemas/irrops.js';

describe('Option Ranker', () => {
  const mockOptions: IrropsOption[] = [
    {
      id: 'opt1',
      type: 'keep_partial',
      segments: [{
        origin: 'JFK',
        destination: 'LAX',
        departure: '2024-12-15T08:00:00Z',
        arrival: '2024-12-15T11:00:00Z',
        carrier: 'AA',
        flightNumber: 'AA123',
        cabin: 'Y',
        status: 'OK'
      }],
      priceChange: { amount: 100, currency: 'USD' },
      rulesApplied: ['MCT validated'],
      citations: ['Fare rule citation'],
      confidence: 0.9
    },
    {
      id: 'opt2',
      type: 'full_reroute',
      segments: [{
        origin: 'JFK',
        destination: 'LAX',
        departure: '2024-12-15T10:00:00Z',
        arrival: '2024-12-15T13:00:00Z',
        carrier: 'DL',
        flightNumber: 'DL456',
        cabin: 'Y',
        status: 'OK'
      }],
      priceChange: { amount: 200, currency: 'USD' },
      rulesApplied: ['Carrier change fee'],
      citations: ['Alternative routing'],
      confidence: 0.7
    }
  ];

  it('should rank options by score', () => {
    const ranked = rankOptions(mockOptions);
    
    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe('opt1'); // Higher confidence, lower price
    expect(ranked[1].id).toBe('opt2');
  });

  it('should prefer options within price limit', () => {
    const preferences = { maxPriceIncrease: 150 };
    const ranked = rankOptions(mockOptions, preferences);
    
    expect(ranked[0].priceChange.amount).toBeLessThanOrEqual(150);
  });

  it('should prefer preferred carriers', () => {
    const preferences = { preferredCarriers: ['AA'] };
    const ranked = rankOptions(mockOptions, preferences);
    
    expect(ranked[0].segments[0].carrier).toBe('AA');
  });

  it('should return empty array for no options', () => {
    const ranked = rankOptions([]);
    expect(ranked).toHaveLength(0);
  });

  it('should limit to top 3 options', () => {
    const manyOptions = Array(5).fill(null).map((_, i) => ({
      ...mockOptions[0],
      id: `opt${i}`,
      confidence: 0.8 - i * 0.1
    }));
    
    const ranked = rankOptions(manyOptions);
    expect(ranked).toHaveLength(3);
  });
});
