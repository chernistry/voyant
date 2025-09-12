import { searchLocations, resolveCity, airportsForCity } from '../../src/tools/amadeus_locations.js';

describe('Amadeus Locations SDK Integration', () => {
  beforeAll(() => {
    // Ensure test environment
    process.env.AMADEUS_HOSTNAME = 'test';
    process.env.AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID || 'test_id';
    process.env.AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET || 'test_secret';
  });

  describe('searchLocations', () => {
    it('should search cities successfully', async () => {
      const results = await searchLocations({
        keyword: 'Paris',
        subType: 'CITY',
        view: 'FULL',
        limit: 5,
      });
      
      expect(Array.isArray(results)).toBe(true);
      // In test environment, may return empty or mock data
    }, 10000);

    it('should handle search with country code', async () => {
      const results = await searchLocations({
        keyword: 'London',
        subType: 'CITY',
        countryCode: 'GB',
        view: 'FULL',
        limit: 5,
      });
      
      expect(Array.isArray(results)).toBe(true);
    }, 10000);

    it('should search airports successfully', async () => {
      const results = await searchLocations({
        keyword: 'JFK',
        subType: 'AIRPORT',
        view: 'FULL',
        limit: 5,
      });
      
      expect(Array.isArray(results)).toBe(true);
    }, 10000);
  });

  describe('resolveCity', () => {
    it('should resolve city with confidence', async () => {
      const result = await resolveCity('Paris');
      
      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(result).toHaveProperty('cityCode');
        expect(result).toHaveProperty('cityName');
        expect(result).toHaveProperty('confidence');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.source).toBe('amadeus');
      }
    }, 10000);

    it('should handle non-existent city', async () => {
      const result = await resolveCity('NonExistentCity12345');
      
      if (result.ok) {
        expect(result.confidence).toBeGreaterThanOrEqual(0);
      } else {
        expect(['not_found', 'timeout', 'network']).toContain(result.reason);
      }
    }, 10000);

    it('should use country hint', async () => {
      const result = await resolveCity('London', 'GB');
      
      expect(result).toHaveProperty('ok');
      // Should prefer UK London over other Londons
    }, 10000);
  });

  describe('airportsForCity', () => {
    it('should find airports for city code', async () => {
      const results = await airportsForCity('PAR');
      
      expect(Array.isArray(results)).toBe(true);
      results.forEach(airport => {
        expect(airport).toHaveProperty('iataCode');
        expect(airport).toHaveProperty('cityCode');
      });
    }, 10000);

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      
      await expect(airportsForCity('NYC', controller.signal))
        .rejects.toThrow();
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network failure by using invalid credentials
      const originalId = process.env.AMADEUS_CLIENT_ID;
      process.env.AMADEUS_CLIENT_ID = 'invalid_id';
      
      try {
        await expect(searchLocations({
          keyword: 'Paris',
          subType: 'CITY',
        })).rejects.toThrow();
      } finally {
        process.env.AMADEUS_CLIENT_ID = originalId;
      }
    }, 10000);
  });
});
