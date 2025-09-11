import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

// Mock the weather API to simulate failures
jest.mock('../../src/tools/weather.js', () => ({
  getWeather: jest.fn(() => Promise.resolve({
    ok: false,
    reason: 'api_failure'
  }))
}));

// Mock the search module to avoid tavily dependency issues
jest.mock('../../src/tools/search.js', () => ({
  searchTravelInfo: jest.fn(() => Promise.resolve({
    ok: true,
    results: [
      {
        title: 'Test Result',
        url: 'https://example.com',
        description: 'This is a test result'
      }
    ]
  })),
  getSearchSource: () => 'mock-search',
  getSearchCitation: () => 'Mock Search'
}));

const app = express();
app.use(express.json());
app.use('/chat', router);

describe('E2E: Error Recovery in Complex Dialogues', () => {
  let threadId: string;

  beforeAll(() => {
    threadId = `error-recovery-${Date.now()}`;
  });

  test('api_failure_during_weather_request', async () => {
    // Test: Weather request that fails due to API issues
    const response1 = await request(app)
      .post('/chat')
      .send({ message: 'What is the weather in London?', threadId });

    expect(response1.status).toBe(200);
    // Should get some response
    
    // Test: Continue conversation after failure
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'What should I pack for London then?', threadId });

    expect(response2.status).toBe(200);
    // Should get some response
  }, 15000);
});