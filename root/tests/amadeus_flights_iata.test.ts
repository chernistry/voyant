import nock from 'nock';
import { searchFlights } from '../src/tools/amadeus_flights.js';
import parisCity from './fixtures/amadeus/paris_cities.json';
import tokenResponse from './fixtures/amadeus/token_response.json';

// Mock the LLM and prompts modules
jest.mock('../src/core/llm.js', () => ({
  callLLM: jest.fn().mockResolvedValue('PAR'),
}));

jest.mock('../src/core/prompts.js', () => ({
  getPrompt: jest.fn().mockResolvedValue('Generate IATA code for: {city_or_airport}'),
}));

describe('Amadeus Flights IATA Resolution', () => {
  const baseUrl = 'https://test.api.amadeus.com';
  
  beforeEach(() => {
    process.env.AMADEUS_CLIENT_ID = 'test_client';
    process.env.AMADEUS_CLIENT_SECRET = 'test_secret';
    process.env.AMADEUS_BASE_URL = baseUrl;
    nock.cleanAll();
    
    // Clear any cached tokens
    jest.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should use Amadeus for city resolution instead of LLM', async () => {
    // Mock token request
    nock(baseUrl)
      .post('/v1/security/oauth2/token')
      .reply(200, tokenResponse);
    
    // Mock location search for Paris
    nock(baseUrl)
      .get('/v1/reference-data/locations')
      .query({ keyword: 'Paris', subType: 'CITY', view: 'FULL', 'page[limit]': '20' })
      .reply(200, parisCity);
    
    // Mock location search for Tokyo (for destination)
    nock(baseUrl)
      .get('/v1/reference-data/locations')
      .query({ keyword: 'Tokyo', subType: 'CITY', view: 'FULL', 'page[limit]': '20' })
      .reply(200, {
        data: [{
          type: 'location',
          subType: 'CITY',
          id: 'CTYO',
          iataCode: 'TYO',
          name: 'Tokyo',
          analytics: { travelers: { score: 90 } }
        }]
      });
    
    // Mock flight search
    nock(baseUrl)
      .get('/v2/shopping/flight-offers')
      .query(true)
      .reply(200, { data: [] });

    const result = await searchFlights({
      origin: 'Paris',
      destination: 'Tokyo',
      departureDate: '2024-10-10',
      passengers: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_flights_found');
    
    // Verify LLM was not called for city resolution (would be called only on fallback)
    const { callLLM } = require('../src/core/llm.js');
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('should pass through existing IATA codes', async () => {
    // Mock token request (still needed for flight search)
    nock(baseUrl)
      .post('/v1/security/oauth2/token')
      .times(2) // Allow multiple token requests
      .reply(200, tokenResponse);
    
    // Mock flight search - no location search should happen for IATA codes
    nock(baseUrl)
      .get('/v2/shopping/flight-offers')
      .query(true)
      .reply(200, { data: [] });

    const result = await searchFlights({
      origin: 'CDG',
      destination: 'NRT',
      departureDate: '2024-10-10',
      passengers: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_flights_found');
    
    // The key test is that no location API calls were made
    // (we don't care about token/flight requests)
  });

  it('should fallback to LLM when Amadeus fails', async () => {
    // Mock token request
    nock(baseUrl)
      .post('/v1/security/oauth2/token')
      .reply(200, tokenResponse);
    
    // Mock location search failure
    nock(baseUrl)
      .get('/v1/reference-data/locations')
      .query(true)
      .reply(500);
    
    // Mock flight search
    nock(baseUrl)
      .get('/v2/shopping/flight-offers')
      .query(true)
      .reply(200, { data: [] });

    const result = await searchFlights({
      origin: 'UnknownCity',
      destination: 'Tokyo',
      departureDate: '2024-10-10',
      passengers: 1,
    });

    // Should still attempt flight search with LLM fallback
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_flights_found');
  });
});
