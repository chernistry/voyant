import nock from 'nock';
import { searchTravelInfo } from '../../src/tools/search.js';

describe('Tavily Search Adapter', () => {
  beforeEach(() => {
    process.env.SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.SEARCH_PROVIDER;
    delete process.env.TAVILY_API_KEY;
    nock.cleanAll();
  });

  test('returns results on success', async () => {
    nock('https://api.tavily.com')
      .post('/search', body => body.query === 'weather in Tokyo')
      .reply(200, {
        results: [
          { title: 'Tokyo Weather', url: 'https://example.com', content: 'Sunny' },
        ],
        answer: 'Sunny in Tokyo',
      });

    const result = await searchTravelInfo('weather in Tokyo');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]?.title).toBe('Tokyo Weather');
      expect(result.deepSummary).toBe('Sunny in Tokyo');
    }
  });
});
