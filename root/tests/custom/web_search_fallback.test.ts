import nock from 'nock';
import { handleChat } from '../../src/core/blend.js';
import { createLogger } from '../../src/util/logging.js';

describe('Web Search Fallback', () => {
  const logger = createLogger();

  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  describe('Explicit Search Commands', () => {
    test('handles "search web for" command', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Best Restaurants in Paris',
                url: 'https://example.com',
                description: 'Top rated restaurants in Paris including Le Comptoir du Relais and L\'Ambroisie'
              }
            ]
          }
        });

      const result = await handleChat(
        { message: 'search web for best restaurants in Paris' },
        { log: logger }
      );

      expect(result.reply).toContain('Based on web search results');
      expect(result.reply).toContain('Best Restaurants in Paris');
      expect(result.citations).toContain('Brave Search');
    });

    test('handles "google" command', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Tokyo Hotels',
                url: 'https://example.com',
                description: 'Best hotels in Tokyo for travelers'
              }
            ]
          }
        });

      const result = await handleChat(
        { message: 'google best hotels in Tokyo' },
        { log: logger }
      );

      expect(result.reply).toContain('Based on web search results');
      expect(result.reply).toContain('Tokyo Hotels');
      expect(result.citations).toContain('Brave Search');
    });
  });

  describe('Travel-Related Unknown Intent with Consent', () => {
    test('offers web search for restaurant questions', async () => {
      const result = await handleChat(
        { message: 'What are the best restaurants in Paris?' },
        { log: logger }
      );

      expect(result.reply).toBe('I can search the web to find current restaurant recommendations. Would you like me to do that?');
      expect(result.citations).toBeUndefined();
    });

    test('offers web search for budget questions', async () => {
      const result = await handleChat(
        { message: 'How much does it cost to visit Tokyo?' },
        { log: logger }
      );

      expect(result.reply).toBe('I can search the web to find current cost and budget information. Would you like me to do that?');
      expect(result.citations).toBeUndefined();
    });

    test('offers web search for flight questions', async () => {
      const result = await handleChat(
        { message: 'What airlines fly to Barcelona?' },
        { log: logger }
      );

      expect(result.reply).toBe('I can search the web to find current flight and airline information. Would you like me to do that?');
      expect(result.citations).toBeUndefined();
    });
  });

  describe('Search Failure Handling', () => {
    test('handles API failure gracefully', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(503);

      const result = await handleChat(
        { message: 'search web for hotels in Rome' },
        { log: logger }
      );

      expect(result.reply).toContain('unable to search the web right now');
      expect(result.reply).toContain('weather, destinations, packing, or attractions');
      expect(result.citations).toBeUndefined();
    });

    test('handles empty search results', async () => {
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: []
          }
        });

      const result = await handleChat(
        { message: 'search web for nonexistent place' },
        { log: logger }
      );

      expect(result.reply).toContain('couldn\'t find relevant information');
      expect(result.reply).toContain('weather, destinations, packing, or attractions');
      expect(result.citations).toBeUndefined();
    });

    test('handles missing API key', async () => {
      delete process.env.BRAVE_SEARCH_API_KEY;

      const result = await handleChat(
        { message: 'search web for hotels in Rome' },
        { log: logger }
      );

      expect(result.reply).toContain('unable to search the web right now');
      expect(result.citations).toBeUndefined();
    });
  });

  describe('Non-Travel Questions', () => {
    test('rejects programming questions', async () => {
      const result = await handleChat(
        { message: 'How do I write JavaScript code?' },
        { log: logger }
      );

      expect(result.reply).toContain('travel assistant focused on helping with weather, destinations, packing, and attractions');
      expect(result.citations).toBeUndefined();
    });

    test('rejects medical questions', async () => {
      const result = await handleChat(
        { message: 'What medicine should I take for headache?' },
        { log: logger }
      );

      expect(result.reply).toContain('travel assistant focused on helping with weather, destinations, packing, and attractions');
      expect(result.citations).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('handles empty messages', async () => {
      const result = await handleChat(
        { message: '' },
        { log: logger }
      );

      expect(result.reply).toContain('I need more information');
      expect(result.citations).toBeUndefined();
    });

    test('handles emoji-only messages', async () => {
      const result = await handleChat(
        { message: '😀😃😄' },
        { log: logger }
      );

      expect(result.reply).toContain('can\'t interpret emoji-only messages');
      expect(result.citations).toBeUndefined();
    });

    test('handles very long city names', async () => {
      const result = await handleChat(
        { message: 'What is the weather in Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch?' },
        { log: logger }
      );

      expect(result.reply).toContain('very long city name');
      expect(result.citations).toBeUndefined();
    });
  });
});
