import { describe, it, expect, jest } from '@jest/globals';
import { processIrrops } from '../../src/core/irrops_engine.js';
import type { PNR, DisruptionEvent } from '../../src/schemas/irrops.js';

// Mock the Amadeus flights module
jest.mock('../../src/tools/amadeus_flights.js', () => ({
  searchAlternatives: jest.fn()
}));

describe('IRROPS Integration Flow', () => {
  beforeEach(() => {
    const { searchAlternatives } = require('../../src/tools/amadeus_flights.js');
    (searchAlternatives as any).mockResolvedValue([
      {
        departure: '2024-12-15T10:00:00Z',
        arrival: '2024-12-15T13:00:00Z',
        carrier: 'AA',
        flightNumber: 'AA125',
        price: 50
      },
      {
        departure: '2024-12-15T12:00:00Z',
        arrival: '2024-12-15T15:00:00Z',
        carrier: 'DL',
        flightNumber: 'DL789',
        price: 100
      }
    ]);
  });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const futureDate = tomorrow.toISOString();
  
  const mockPNR: PNR = {
    recordLocator: 'ABC123',
    passengers: [{ name: 'JOHN DOE', type: 'ADT' }],
    segments: [{
      origin: 'JFK',
      destination: 'LAX',
      departure: futureDate,
      arrival: futureDate.replace('T08:', 'T11:'),
      carrier: 'AA',
      flightNumber: 'AA123',
      cabin: 'Y',
      status: 'XX' // Cancelled
    }]
  };

  const mockDisruption: DisruptionEvent = {
    type: 'cancellation',
    affectedSegments: [0],
    timestamp: futureDate.replace('T08:', 'T06:'),
    reason: 'Aircraft maintenance',
    severity: 'high'
  };

  it('should process cancellation and return rebooking options', async () => {
    const options = await processIrrops(mockPNR, mockDisruption);
    
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toMatchObject({
      type: 'keep_partial',
      segments: expect.arrayContaining([
        expect.objectContaining({
          carrier: 'AA',
          flightNumber: 'AA125'
        })
      ]),
      confidence: expect.any(Number)
    });
  });

  it('should handle user preferences', async () => {
    const preferences = {
      maxPriceIncrease: 75,
      preferredCarriers: ['AA']
    };
    
    const options = await processIrrops(mockPNR, mockDisruption, preferences);
    
    // Should prefer AA carrier and respect price limit
    expect(options[0].segments[0].carrier).toBe('AA');
    expect(options[0].priceChange.amount).toBeLessThanOrEqual(75 + 150); // Including base fee
  });

  it('should handle delay disruptions', async () => {
    const delayDisruption: DisruptionEvent = {
      type: 'delay',
      affectedSegments: [0],
      timestamp: '2024-12-15T06:00:00Z',
      reason: 'Weather delay',
      severity: 'medium'
    };
    
    const options = await processIrrops(mockPNR, delayDisruption);
    
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].confidence).toBeGreaterThan(0.5);
  });

  it('should handle equipment change disruptions', async () => {
    const equipmentDisruption: DisruptionEvent = {
      type: 'equipment_change',
      affectedSegments: [0],
      timestamp: '2024-12-15T06:00:00Z',
      reason: 'Aircraft swap',
      severity: 'low'
    };
    
    const options = await processIrrops(mockPNR, equipmentDisruption);
    
    expect(options.length).toBeGreaterThan(0);
    // Equipment changes should have higher confidence
    expect(options[0].confidence).toBeGreaterThan(0.7);
  });

  it('should handle signal abortion', async () => {
    const controller = new AbortController();
    controller.abort();
    
    await expect(
      processIrrops(mockPNR, mockDisruption, {}, controller.signal)
    ).rejects.toThrow();
  });
});
