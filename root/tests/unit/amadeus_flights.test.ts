import { searchFlights, convertToAmadeusDate } from '../../src/tools/amadeus_flights.js';
import { routeIntent } from '../../src/core/router.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the fetch utility
jest.mock('../../src/util/fetch.js', () => ({
  fetchJSON: jest.fn(),
  ExternalFetchError: class ExternalFetchError extends Error {
    constructor(public kind: string, public status?: number) {
      super(`External fetch error: ${kind}`);
    }
  },
}));

const mockFetchJSON = jest.mocked(require('../../src/util/fetch.js').fetchJSON);

describe('Amadeus Flight Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables for tests
    process.env.AMADEUS_CLIENT_ID = 'test_client_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_client_secret';
    process.env.AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
  });

  describe('searchFlights function', () => {
    it('should return error for missing required fields', async () => {
      const result = await searchFlights({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('missing_required_fields');
      }
    });

    it('should successfully search for one-way flights', async () => {
      // Mock token response
      mockFetchJSON
        .mockResolvedValueOnce({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
        // Mock flight search response
        .mockResolvedValueOnce({
          data: [
            {
              id: 'flight1',
              price: { currency: 'USD', total: '299.99' },
              itineraries: [
                {
                  duration: 'PT5H30M',
                  segments: [
                    {
                      departure: { iataCode: 'JFK', at: '2024-03-15T08:00:00' },
                      arrival: { iataCode: 'LHR', at: '2024-03-15T20:30:00' },
                      carrierCode: 'BA',
                      number: '117',
                      duration: 'PT5H30M',
                    },
                  ],
                },
              ],
            },
          ],
        });

      const result = await searchFlights({
        origin: 'JFK',
        destination: 'LHR',
        departureDate: '2024-03-15',
        passengers: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('Found 1 one-way flights');
        expect(result.summary).toContain('JFK to LHR');
        expect(result.summary).toContain('USD 299.99');
        expect(result.source).toBe('amadeus');
      }
    });

    it('should handle round-trip flights', async () => {
      mockFetchJSON
        .mockResolvedValueOnce({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'flight1',
              price: { currency: 'USD', total: '599.99' },
              itineraries: [
                {
                  duration: 'PT6H00M',
                  segments: [
                    {
                      departure: { iataCode: 'LAX', at: '2024-04-01T10:00:00' },
                      arrival: { iataCode: 'NRT', at: '2024-04-02T15:00:00' },
                      carrierCode: 'AA',
                      number: '168',
                      duration: 'PT6H00M',
                    },
                  ],
                },
              ],
            },
          ],
        });

      const result = await searchFlights({
        origin: 'LAX',
        destination: 'NRT',
        departureDate: '2024-04-01',
        returnDate: '2024-04-15',
        passengers: 2,
        cabinClass: 'business',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('round-trip flights');
        expect(result.summary).toContain('returning 2024-04-15');
      }
    });

    it('should handle API errors gracefully', async () => {
      const { ExternalFetchError } = require('../../src/util/fetch.js');
      mockFetchJSON
        .mockResolvedValueOnce({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
        .mockRejectedValueOnce(new ExternalFetchError('http_5xx', undefined, 500));

      const result = await searchFlights({
        origin: 'JFK',
        destination: 'LHR',
        departureDate: '2024-03-15',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('timeout');
      }
    });

    it('should handle no flights found', async () => {
      mockFetchJSON
        .mockResolvedValueOnce({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
        .mockResolvedValueOnce({ data: [] });

      const result = await searchFlights({
        origin: 'JFK',
        destination: 'LHR',
        departureDate: '2024-03-15',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_flights_found');
      }
    });
  });

  describe('Router Integration', () => {
    it('should route flight queries to flights intent', async () => {
      const result = await routeIntent({
        message: 'find flights from NYC to London on March 15',
      });

      expect(result.intent).toBe('flights');
      expect(result.needExternal).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should extract flight slots correctly', async () => {
      const result = await routeIntent({
        message: 'I need 2 business class flights from Los Angeles to Tokyo departing April 1st',
      });

      expect(result.intent).toBe('flights');
      expect(result.slots.originCity).toContain('Los Angeles');
      expect(result.slots.destinationCity).toContain('Tokyo');
      expect(result.slots.passengers).toBe('2');
      expect(result.slots.cabinClass).toBe('business');
    });

    it('should handle round-trip flight queries', async () => {
      const result = await routeIntent({
        message: 'round trip flights from Miami to Paris, leaving March 10 returning March 20',
      });

      expect(result.intent).toBe('flights');
      expect(result.slots.originCity).toContain('Miami');
      expect(result.slots.destinationCity).toContain('Paris');
      expect(result.slots.departureDate).toContain('March 10');
      expect(result.slots.returnDate).toContain('March 20');
    });

    it('should handle various flight-related keywords', async () => {
      const queries = [
        'book a flight to Paris',
        'airline tickets to Tokyo',
        'fly from NYC to LA',
        'air travel to London',
        'flight search Chicago to Miami',
      ];

      for (const query of queries) {
        const result = await routeIntent({ message: query });
        expect(result.intent).toBe('flights');
        expect(result.needExternal).toBe(true);
      }
    });
  });

  describe('Date Conversion', () => {
    it('should convert DD-MM-YYYY to YYYY-MM-DD', async () => {
      const result1 = await convertToAmadeusDate('12-10-2025');
      expect(result1).toBe('2025-10-12');
      const result2 = await convertToAmadeusDate('1-1-2024');
      expect(result2).toBe('2024-01-01');
      const result3 = await convertToAmadeusDate('31-12-2023');
      expect(result3).toBe('2023-12-31');
    });

    it('should handle MM-DD-YYYY format', async () => {
      const result1 = await convertToAmadeusDate('10-12-2025');
      expect(result1).toBe('2025-12-10'); // DD-MM-YYYY (our default)
      const result2 = await convertToAmadeusDate('13-12-2023');
      expect(result2).toBe('2023-12-13'); // Clearly DD-MM-YYYY (13 > 12)
      const result3 = await convertToAmadeusDate('12-31-2023');
      expect(result3).toBe('2023-12-31'); // Interpreted as MM-DD-YYYY (31 > 12)
    });

    it('should keep YYYY-MM-DD format unchanged', async () => {
      const result1 = await convertToAmadeusDate('2025-10-12');
      expect(result1).toBe('2025-10-12');
      const result2 = await convertToAmadeusDate('2023-12-31');
      expect(result2).toBe('2023-12-31');
    });

    it('should handle edge cases', async () => {
      const currentYear = new Date().getFullYear();
      const result1 = await convertToAmadeusDate('');
      expect(result1).toBe(`${currentYear}-01-01`);
      const result2 = await convertToAmadeusDate('invalid-date');
      expect(result2).toBe(`${currentYear}-01-01`);
    });
  });
});
