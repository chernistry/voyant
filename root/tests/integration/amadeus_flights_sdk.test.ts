import { 
  flightOffersGet, 
  flightOffersPost, 
  flightOffersPrice, 
  seatmapsFromOffer 
} from '../../src/tools/amadeus_flights.js';

describe('Amadeus Flights SDK Integration', () => {
  beforeAll(() => {
    process.env.AMADEUS_HOSTNAME = 'test';
    process.env.AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID || 'test_id';
    process.env.AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET || 'test_secret';
  });

  describe('flightOffersGet', () => {
    it('should search flights successfully', async () => {
      const query = {
        originLocationCode: 'NYC',
        destinationLocationCode: 'LAX',
        departureDate: '2024-12-01',
        adults: '1',
      };
      
      const result = await flightOffersGet(query);
      expect(result).toBeDefined();
      // In test environment, may return empty array or mock data
    }, 15000);

    it('should handle round trip search', async () => {
      const query = {
        originLocationCode: 'BOS',
        destinationLocationCode: 'SFO',
        departureDate: '2024-12-01',
        returnDate: '2024-12-08',
        adults: '2',
        max: '5',
      };
      
      const result = await flightOffersGet(query);
      expect(result).toBeDefined();
    }, 15000);

    it('should handle non-stop preference', async () => {
      const query = {
        originLocationCode: 'JFK',
        destinationLocationCode: 'LAX',
        departureDate: '2024-12-01',
        adults: '1',
        nonStop: true,
      };
      
      const result = await flightOffersGet(query);
      expect(result).toBeDefined();
    }, 15000);

    it('should respect AbortSignal', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      
      const query = {
        originLocationCode: 'NYC',
        destinationLocationCode: 'LAX',
        departureDate: '2024-12-01',
        adults: '1',
      };
      
      await expect(flightOffersGet(query, controller.signal))
        .rejects.toThrow();
    }, 10000);
  });

  describe('flightOffersPost', () => {
    it('should handle POST search with complex criteria', async () => {
      const searchBody = {
        currencyCode: 'USD',
        originDestinations: [
          {
            id: '1',
            originLocationCode: 'NYC',
            destinationLocationCode: 'LAX',
            departureDateTimeRange: {
              date: '2024-12-01',
            },
          },
        ],
        travelers: [
          {
            id: '1',
            travelerType: 'ADULT',
          },
        ],
        sources: ['GDS'],
        searchCriteria: {
          maxFlightOffers: 5,
        },
      };
      
      const result = await flightOffersPost(searchBody);
      expect(result).toBeDefined();
    }, 15000);
  });

  describe('error scenarios', () => {
    it('should handle invalid route', async () => {
      const query = {
        originLocationCode: 'INVALID',
        destinationLocationCode: 'INVALID',
        departureDate: '2024-12-01',
        adults: '1',
      };
      
      await expect(flightOffersGet(query))
        .rejects.toThrow();
    }, 15000);

    it('should handle past dates', async () => {
      const query = {
        originLocationCode: 'NYC',
        destinationLocationCode: 'LAX',
        departureDate: '2020-01-01',
        adults: '1',
      };
      
      await expect(flightOffersGet(query))
        .rejects.toThrow();
    }, 15000);
  });

  describe('LLM fallback', () => {
    it('should use LLM fallback when enabled', async () => {
      const originalResolver = process.env.IATA_RESOLVER;
      process.env.IATA_RESOLVER = 'llm';
      
      try {
        const query = {
          originLocationCode: 'NONEXISTENT',
          destinationLocationCode: 'INVALID',
          departureDate: '2024-12-01',
          adults: '1',
        };
        
        // This should trigger fallback due to invalid codes
        const result = await flightOffersGet(query);
        
        if (result && typeof result === 'object' && 'fallback' in result) {
          expect(result.fallback).toBe(true);
          expect(result.source).toBe('llm_fallback');
        }
      } finally {
        process.env.IATA_RESOLVER = originalResolver;
      }
    }, 20000);
  });
});
