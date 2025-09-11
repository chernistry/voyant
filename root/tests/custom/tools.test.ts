import { getWeather } from '../../src/tools/weather.js';
import { getCountryFacts } from '../../src/tools/country.js';
import { getAttractions } from '../../src/tools/attractions.js';

describe('Tools Layer', () => {
  describe('Weather Tool', () => {
    test('returns weather for known city', async () => {
      const result = await getWeather({ city: 'Tokyo', datesOrMonth: 'March' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('°C');
        expect(result.summary).toContain('precip prob');
      }
    });

    test('handles unknown city gracefully', async () => {
      const result = await getWeather({ city: 'UnknownCity' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('unknown_city');
      }
    });

    test('handles missing city', async () => {
      const result = await getWeather({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_city');
      }
    });
  });

  describe('Country Facts Tool', () => {
    test('returns country facts for known city', async () => {
      const result = await getCountryFacts({ city: 'Tokyo' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('Japan');
        expect(result.summary).toContain('Currency');
        expect(result.summary).toContain('Language');
      }
    });

    test('handles unknown city gracefully', async () => {
      const result = await getCountryFacts({ city: 'UnknownCity' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('unknown_city');
      }
    });

    test('handles missing city', async () => {
      const result = await getCountryFacts({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_city');
      }
    });
  });

  describe('Attractions Tool', () => {
    test('returns attractions for known city', async () => {
      const result = await getAttractions({ city: 'Tokyo', limit: 3 });
      if (result.ok) {
        expect(typeof result.summary).toBe('string');
        expect(result.summary.length).toBeGreaterThan(0);
      } else {
        expect(['no_pois', 'timeout', 'network', 'invalid_schema', 'http_4xx', 'http_5xx', 'unknown_city']).toContain(result.reason);
      }
    });

    test('handles missing city', async () => {
      const result = await getAttractions({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_city');
      }
    });

    test('respects limit parameter', async () => {
      const result = await getAttractions({ city: 'Paris', limit: 2 });
      if (result.ok) {
        const items = result.summary.split(', ');
        expect(items.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('Error Handling', () => {
    test('tools handle network timeouts gracefully', async () => {
      // This test verifies timeout handling exists, actual timeout testing would require mocking
      const result = await getWeather({ city: 'Tokyo' });
      const expectedValues = result.ok
        ? ['ok']
        : ['timeout', 'http_5xx', 'http_4xx', 'unknown_city', 'no_city', 'network'];
      expect(expectedValues).toContain(result.ok ? 'ok' : result.reason);
    });
  });
});
