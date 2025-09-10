import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { routeIntent } from '../../src/core/router.js';
import { runGraphTurn } from '../../src/core/graph.js';

// Mock the Amadeus API calls
jest.mock('../../src/util/fetch.js', () => ({
  fetchJSON: jest.fn(),
  ExternalFetchError: class ExternalFetchError extends Error {
    constructor(public kind: string, public status?: number) {
      super(`External fetch error: ${kind}`);
    }
  },
}));

const mockFetchJSON = jest.mocked(require('../../src/util/fetch.js').fetchJSON);

describe('Flight Search Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AMADEUS_CLIENT_ID = 'test_client_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_client_secret';
    process.env.AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
  });

  it('should handle complete flight search flow', async () => {
    // Mock successful API responses
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
            price: { currency: 'USD', total: '450.00' },
            itineraries: [
              {
                duration: 'PT3H45M',
                segments: [
                  {
                    departure: { iataCode: 'JFK', at: '2024-06-15T09:00:00' },
                    arrival: { iataCode: 'MIA', at: '2024-06-15T12:45:00' },
                    carrierCode: 'AA',
                    number: '1234',
                    duration: 'PT3H45M',
                  },
                ],
              },
            ],
          },
          {
            id: 'flight2',
            price: { currency: 'USD', total: '520.00' },
            itineraries: [
              {
                duration: 'PT4H15M',
                segments: [
                  {
                    departure: { iataCode: 'JFK', at: '2024-06-15T14:30:00' },
                    arrival: { iataCode: 'MIA', at: '2024-06-15T18:45:00' },
                    carrierCode: 'DL',
                    number: '5678',
                    duration: 'PT4H15M',
                  },
                ],
              },
            ],
          },
        ],
      });

    const result = await runGraphTurn(
      'Find flights from New York to Miami on June 15th',
      'test-thread-123'
    );

    expect(result.reply).toContain('Found 2 one-way flights');
    expect(result.reply).toContain('New York to Miami');
    expect(result.reply).toContain('June 15');
    expect(result.reply).toContain('USD 450.00');
    expect(result.reply).toContain('USD 520.00');
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Amadeus Flight Search API',
        }),
      ])
    );
  });

  it('should handle flight search with multiple passengers and cabin class', async () => {
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
            price: { currency: 'USD', total: '1200.00' },
            itineraries: [
              {
                duration: 'PT5H30M',
                segments: [
                  {
                    departure: { iataCode: 'LAX', at: '2024-07-20T10:00:00' },
                    arrival: { iataCode: 'LHR', at: '2024-07-21T06:30:00' },
                    carrierCode: 'BA',
                    number: '269',
                    duration: 'PT5H30M',
                  },
                ],
              },
            ],
          },
        ],
      });

    const result = await runGraphTurn(
      'I need 2 business class flights from Los Angeles to London on July 20th',
      'test-thread-456'
    );

    expect(result.reply).toContain('Found 1 one-way flights');
    expect(result.reply).toContain('Los Angeles to London');
    expect(result.reply).toContain('July 20');
    expect(result.reply).toContain('USD 1200.00');
  });

  it('should handle round-trip flight requests', async () => {
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
            price: { currency: 'USD', total: '850.00' },
            itineraries: [
              {
                duration: 'PT2H30M',
                segments: [
                  {
                    departure: { iataCode: 'SFO', at: '2024-08-10T08:00:00' },
                    arrival: { iataCode: 'SEA', at: '2024-08-10T10:30:00' },
                    carrierCode: 'AS',
                    number: '123',
                    duration: 'PT2H30M',
                  },
                ],
              },
            ],
          },
        ],
      });

    const result = await runGraphTurn(
      'Round trip flights from San Francisco to Seattle, departing August 10 returning August 17',
      'test-thread-789'
    );

    expect(result.reply).toContain('round-trip flights');
    expect(result.reply).toContain('San Francisco to Seattle');
    expect(result.reply).toContain('August 10');
    expect(result.reply).toContain('returning August 17');
  });

  it('should handle API failures gracefully', async () => {
    const { ExternalFetchError } = require('../../src/util/fetch.js');
    mockFetchJSON.mockRejectedValueOnce(new ExternalFetchError('timeout'));

    const result = await runGraphTurn(
      'Find flights from Boston to Chicago tomorrow',
      'test-thread-error'
    );

    // Should fallback to blend with facts
    expect(result.reply).toBeTruthy();
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it('should handle no flights found scenario', async () => {
    mockFetchJSON
      .mockResolvedValueOnce({
        access_token: 'test_token',
        token_type: 'Bearer',
        expires_in: 3600,
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await runGraphTurn(
      'Flights from Anchorage to Honolulu on December 25th',
      'test-thread-empty'
    );

    // Should fallback to blend with facts when no flights found
    expect(result.reply).toBeTruthy();
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it('should maintain conversation context across multiple flight queries', async () => {
    const threadId = 'test-thread-context';

    // First query establishes origin
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
            price: { currency: 'USD', total: '300.00' },
            itineraries: [
              {
                duration: 'PT2H00M',
                segments: [
                  {
                    departure: { iataCode: 'DEN', at: '2024-09-01T12:00:00' },
                    arrival: { iataCode: 'PHX', at: '2024-09-01T14:00:00' },
                    carrierCode: 'WN',
                    number: '1001',
                    duration: 'PT2H00M',
                  },
                ],
              },
            ],
          },
        ],
      });

    const firstResult = await runGraphTurn(
      'Flights from Denver to Phoenix on September 1st',
      threadId
    );

    expect(firstResult.reply).toContain('Denver to Phoenix');

    // Second query should use context
    mockFetchJSON
      .mockResolvedValueOnce({
        access_token: 'test_token',
        token_type: 'Bearer',
        expires_in: 3600,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'flight2',
            price: { currency: 'USD', total: '280.00' },
            itineraries: [
              {
                duration: 'PT1H45M',
                segments: [
                  {
                    departure: { iataCode: 'DEN', at: '2024-09-02T10:00:00' },
                    arrival: { iataCode: 'LAS', at: '2024-09-02T11:45:00' },
                    carrierCode: 'WN',
                    number: '2002',
                    duration: 'PT1H45M',
                  },
                ],
              },
            ],
          },
        ],
      });

    const secondResult = await runGraphTurn(
      'What about flights to Las Vegas the next day?',
      threadId
    );

    expect(secondResult.reply).toContain('Las Vegas');
  });
});
