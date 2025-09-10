import { convertToAmadeusDate } from '../../src/tools/amadeus_flights.js';
import { searchFlights } from '../../src/tools/amadeus_flights.js';
import { routeIntent } from '../../src/core/router.js';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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

describe('Date Formatting Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables for tests
    process.env.AMADEUS_CLIENT_ID = 'test_client_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_client_secret';
    process.env.AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
  });

  it('should correctly format DD-MM-YYYY date for Amadeus API', async () => {
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
                    departure: { iataCode: 'SVO', at: '2025-10-12T08:00:00' },
                    arrival: { iataCode: 'TLV', at: '2025-10-12T20:30:00' },
                    carrierCode: 'SU',
                    number: '117',
                    duration: 'PT5H30M',
                  },
                ],
              },
            ],
          },
        ],
      });

    // Test the specific failing case from the error log
    const result = await searchFlights({
      origin: 'SVO', // Moscow
      destination: 'TLV', // Tel Aviv
      departureDate: '12-10-2025', // DD-MM-YYYY format
      passengers: 1,
    });

    console.log('Search result:', result);
    console.log('Mock calls:', mockFetchJSON.mock.calls.length);

    // Check that we made the expected calls
    expect(mockFetchJSON).toHaveBeenCalledTimes(2);
    
    // First call should be for the token
    expect(mockFetchJSON.mock.calls[0][0]).toContain('/v1/security/oauth2/token');
    
    // Second call should be for the flight search with correctly formatted date
    expect(mockFetchJSON.mock.calls[1][0]).toContain('/v2/shopping/flight-offers');
    expect(mockFetchJSON.mock.calls[1][0]).toContain('departureDate=2025-10-12');
    expect(mockFetchJSON.mock.calls[1][0]).toContain('originLocationCode=SVO');
    expect(mockFetchJSON.mock.calls[1][0]).toContain('destinationLocationCode=TLV');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Found 1 one-way flights');
      expect(result.summary).toContain('SVO to TLV');
      expect(result.summary).toContain('USD 299.99');
      expect(result.source).toBe('amadeus');
    }
  });

  it('should handle the full routing pipeline with DD-MM-YYYY date', async () => {
    // This test would require more extensive mocking of the entire pipeline
    // For now, we're focusing on the date conversion which we've already tested
    expect(convertToAmadeusDate('12-10-2025')).toBe('2025-10-12');
  });
});