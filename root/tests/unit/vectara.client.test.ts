// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock the config to avoid requiring real API keys in tests
jest.mock('../../src/config/vectara.js', () => ({
  VECTARA: {
    BASE_URL: 'https://api.vectara.io',
    QUERY_PATH: '/v1/query',
    INDEX_PATH: '/v1/index',
    API_KEY: 'test-key',
    CUSTOMER_ID: 'test-customer',
    CORPUS: {
      AIRLINES: 'test-airlines',
      HOTELS: 'test-hotels',
      VISAS: 'test-visas',
    },
    TIMEOUT_MS: 1000,
    RETRIES: 1,
    CACHE_TTL_MS: 5000,
    ENABLED: true,
  },
}));

// Mock ExternalFetchError
jest.mock('../../src/util/fetch.js', () => ({
  ExternalFetchError: class ExternalFetchError extends Error {
    constructor(public kind: string, public message: string) {
      super(message);
    }
  },
}));

import { VectaraClient } from '../../src/tools/vectara.js';
import { ExternalFetchError } from '../../src/util/fetch.js';

describe('VectaraClient', () => {
  let client: VectaraClient;

  beforeEach(() => {
    client = new VectaraClient();
    client.clearCache();
    mockFetch.mockClear();
  });

  describe('query', () => {
    it('should return normalized response with hits and citations', async () => {
      const mockResponse = {
        summary: [{ text: 'Test summary' }],
        results: [
          {
            text: 'Test snippet',
            score: 0.95,
            documentId: 'doc1',
            metadata: { url: 'https://example.com', title: 'Test Doc' },
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.query('baggage policy', { corpus: 'airlines' });

      expect(result.summary).toBe('Test summary');
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]?.snippet).toBe('Test snippet');
      expect(result.hits[0]?.url).toBe('https://example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vectara.io/v1/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
          }),
        })
      );
    });

    it('should use cache for repeated queries', async () => {
      const mockResponse = { summary: [{ text: 'Cached' }], results: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.query('test query', { corpus: 'airlines' });
      await client.query('test query', { corpus: 'airlines' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw ExternalFetchError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        client.query('test', { corpus: 'airlines' })
      ).rejects.toThrow(ExternalFetchError);
    });
  });

  describe('index', () => {
    it('should index document successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await client.index({
        id: 'test-doc',
        corpus: 'airlines',
        title: 'Test Policy',
        text: 'Policy content',
        url: 'https://example.com/policy',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vectara.io/v1/index',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test Policy'),
        })
      );
    });

    it('should handle indexing failures', async () => {
      mockFetch.mockRejectedValue(new Error('Index error'));

      await expect(
        client.index({
          id: 'test-doc',
          corpus: 'airlines',
          title: 'Test',
          text: 'Content',
        })
      ).rejects.toThrow(ExternalFetchError);
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', async () => {
      const mockResponse = { summary: [{ text: 'Test' }], results: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call
      await client.query('test', { corpus: 'airlines' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await client.query('test', { corpus: 'airlines' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache and call again
      client.clearCache();
      await client.query('test', { corpus: 'airlines' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
