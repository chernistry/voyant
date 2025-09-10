import nock from 'nock';
import {
  searchTravelInfo,
  extractWeatherFromResults,
  extractCountryFromResults,
} from '../src/tools/brave_search.js';

describe('Brave Search Adapter', () => {
  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  describe('searchTravelInfo', () => {
    test('returns search results on success', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Tokyo Weather',
                url: 'https://example.com',
                description: 'Current weather in Tokyo'
              }
            ]
          }
        });

      const result = await searchTravelInfo('weather in Tokyo');
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.title).toBe('Tokyo Weather');
      }
    });

    test('handles API failure', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(503);

      const result = await searchTravelInfo('weather in Tokyo');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['http_5xx', 'http_4xx', 'network', 'timeout']).toContain(result.reason);
      }
    });

    test('handles missing API key', async () => {
      delete process.env.BRAVE_SEARCH_API_KEY;
      
      const result = await searchTravelInfo('weather in Tokyo');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_api_key');
      }
    });

    test('handles empty query', async () => {
      const result = await searchTravelInfo('');
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('no_query');
      }
    });
  });

  describe('extractWeatherFromResults', () => {
    test('extracts temperature ranges from results', () => {
      const results = [
        {
          title: 'Tokyo Weather Forecast',
          url: 'https://example.com',
          description: 'Tokyo weather today: High 25°C, Low 18°C with sunny conditions'
        }
      ];

      const weather = extractWeatherFromResults(results, 'Tokyo');
      
      expect(weather).toContain('25');
      expect(weather).toContain('18');
      expect(weather).toContain('Tokyo');
    });

    test('extracts weather info without specific temperature format', () => {
      const results = [
        {
          title: 'Tokyo Weather',
          url: 'https://example.com',
          description: 'Current weather conditions in Tokyo with temperature and forecast information'
        }
      ];

      const weather = extractWeatherFromResults(results, 'Tokyo');
      
      expect(weather).toContain('Tokyo');
      expect(weather).toContain('weather');
    });

    test('returns null when no weather info found', () => {
      const results = [
        {
          title: 'Tokyo Travel Guide',
          url: 'https://example.com',
          description: 'Best places to visit in Tokyo for tourists'
        }
      ];

      const weather = extractWeatherFromResults(results, 'Tokyo');
      
      expect(weather).toBeNull();
    });
  });

  describe('extractCountryFromResults', () => {
    test('extracts country information from results', () => {
      const results = [
        {
          title: 'Japan Travel Information',
          url: 'https://example.com',
          description: 'Japan travel guide with currency, language, and cultural information'
        }
      ];

      const country = await extractCountryFromResults(results, 'Japan');

      expect(country).toContain('Japan');
      expect(country).toContain('travel');
    });

    test('returns null when no country info found', () => {
      const results = [
        {
          title: 'Random Article',
          url: 'https://example.com',
          description: 'This has nothing to do with travel or countries'
        }
      ];

      const country = await extractCountryFromResults(results, 'Japan');

      expect(country).toBeNull();
    });
  });

});
