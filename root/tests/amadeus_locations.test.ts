import nock from 'nock';
import { resolveCity, airportsForCity, searchLocations } from '../src/tools/amadeus_locations.js';
import parisCity from './fixtures/amadeus/paris_cities.json';
import parisAirports from './fixtures/amadeus/paris_airports.json';
import tokenResponse from './fixtures/amadeus/token_response.json';

describe('Amadeus Locations', () => {
  const baseUrl = 'https://test.api.amadeus.com';
  
  beforeEach(() => {
    process.env.AMADEUS_CLIENT_ID = 'test_client';
    process.env.AMADEUS_CLIENT_SECRET = 'test_secret';
    process.env.AMADEUS_BASE_URL = baseUrl;
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('resolveCity', () => {
    it('should resolve Paris with high confidence', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query({ keyword: 'Paris', subType: 'CITY', view: 'FULL', 'page[limit]': '20' })
        .reply(200, parisCity);

      const result = await resolveCity('Paris');
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cityCode).toBe('PAR');
        expect(result.cityName).toBe('Paris');
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.source).toBe('amadeus');
        expect(result.geo).toEqual({ latitude: 48.85341, longitude: 2.3488 });
      }
    });

    it('should return not_found for unknown city', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query(true)
        .reply(200, { data: [] });

      const result = await resolveCity('UnknownCity');
      
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('not_found');
    });

    it('should handle timeout errors', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query(true)
        .delay(5000) // Delay longer than timeout
        .reply(200, parisCity);

      const result = await resolveCity('TimeoutCity');
      
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe('network'); // Circuit breaker converts timeout to network
    });

    it('should handle 429 rate limit with retry', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query(true)
        .reply(429, {}, { 'retry-after': '1' })
        .get('/v1/reference-data/locations')
        .query(true)
        .reply(200, parisCity);

      const result = await resolveCity('Paris');
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cityCode).toBe('PAR');
      }
    });
  });

  describe('airportsForCity', () => {
    it('should return airports for PAR ordered by score', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query({ keyword: 'PAR', subType: 'AIRPORT', view: 'FULL', 'page[limit]': '20' })
        .reply(200, parisAirports);

      const airports = await airportsForCity('PAR');
      
      expect(airports).toHaveLength(2);
      expect(airports[0].iataCode).toBe('CDG');
      expect(airports[0].score).toBe(85);
      expect(airports[1].iataCode).toBe('ORY');
      expect(airports[1].score).toBe(72);
    });

    it('should return empty array on error', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query({ keyword: 'ERROR', subType: 'AIRPORT', view: 'FULL', 'page[limit]': '20' })
        .reply(500);

      const airports = await airportsForCity('ERROR');
      
      expect(airports).toEqual([]);
    });
  });

  describe('searchLocations', () => {
    it('should cache results for 10 minutes', async () => {
      nock(baseUrl)
        .post('/v1/security/oauth2/token')
        .reply(200, tokenResponse);
      
      nock(baseUrl)
        .get('/v1/reference-data/locations')
        .query(true)
        .reply(200, parisCity);

      // First call
      const result1 = await searchLocations({ keyword: 'Paris', subType: 'CITY' });
      expect(result1).toHaveLength(1);

      // Second call should use cache (no additional HTTP request)
      const result2 = await searchLocations({ keyword: 'Paris', subType: 'CITY' });
      expect(result2).toHaveLength(1);
      expect(result2).toEqual(result1);
    });
  });
});
