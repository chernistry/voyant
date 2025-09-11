const TavilyClient = {
  search: jest.fn().mockResolvedValue({
    results: [
      {
        url: 'https://example.com',
        content: 'Mocked search result for tavily.',
        title: 'Mock Title',
        score: 0.9
      }
    ]
  })
};

module.exports = { TavilyClient };
