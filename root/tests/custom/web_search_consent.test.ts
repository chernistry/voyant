import nock from 'nock';
import { handleChat } from '../../src/core/blend.js';
import { createLogger } from '../../src/util/logging.js';

describe('Web Search Consent Flow', () => {
  const logger = createLogger();

  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  describe('Consent Response Handling', () => {
    test('handles "yes" response and performs search', async () => {
      // First, trigger consent request
      const consentResult = await handleChat(
        { message: 'What are the best restaurants in Paris?', threadId: 'test-thread' },
        { log: logger }
      );

      expect(consentResult.reply).toBe('I can search the web to find current restaurant recommendations. Would you like me to do that?');

      // Mock search API for the "yes" response
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Best Restaurants in Paris',
                url: 'https://example.com',
                description: 'Top rated restaurants in Paris including Le Comptoir du Relais'
              }
            ]
          }
        });

      // Now respond with "yes"
      const searchResult = await handleChat(
        { message: 'yes', threadId: 'test-thread' },
        { log: logger }
      );

      expect(searchResult.reply).toContain('Based on web search results');
      expect(searchResult.reply).toContain('Best Restaurants in Paris');
      expect(searchResult.citations).toContain('Brave Search');
    });

    test('handles "no" response gracefully', async () => {
      // First, trigger consent request
      await handleChat(
        { message: 'What are the best restaurants in Paris?', threadId: 'test-thread-2' },
        { log: logger }
      );

      // Now respond with "no"
      const result = await handleChat(
        { message: 'no', threadId: 'test-thread-2' },
        { log: logger }
      );

      expect(result.reply).toBe('No problem! Is there something else about travel planning I can help with?');
      expect(result.citations).toBeUndefined();
    });

    test('handles various positive consent responses', async () => {
      const positiveResponses = ['yes', 'yeah', 'sure', 'please', 'go ahead', 'do it'];
      
      for (const response of positiveResponses) {
        const threadId = `test-thread-${response}`;
        
        // Trigger consent request
        await handleChat(
          { message: 'What are the best restaurants in Paris?', threadId },
          { log: logger }
        );

        // Mock search API
        nock('https://api.search.brave.com')
          .get('/res/v1/web/search')
          .query(true)
          .reply(200, {
            web: {
              results: [
                {
                  title: 'Paris Restaurants',
                  url: 'https://example.com',
                  description: 'Great restaurants in Paris'
                }
              ]
            }
          });

        // Respond with positive consent
        const result = await handleChat(
          { message: response, threadId },
          { log: logger }
        );

        expect(result.reply).toContain('Based on web search results');
        expect(result.citations).toContain('Brave Search');
      }
    });

    test('handles various negative consent responses', async () => {
      const negativeResponses = ['no', 'nope', 'not now', 'maybe later', 'skip'];
      
      for (const response of negativeResponses) {
        const threadId = `test-thread-${response}`;
        
        // Trigger consent request
        await handleChat(
          { message: 'What are the best restaurants in Paris?', threadId },
          { log: logger }
        );

        // Respond with negative consent
        const result = await handleChat(
          { message: response, threadId },
          { log: logger }
        );

        expect(result.reply).toBe('No problem! Is there something else about travel planning I can help with?');
        expect(result.citations).toBeUndefined();
      }
    });
  });
});
