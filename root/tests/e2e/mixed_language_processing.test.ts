import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

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

describe('E2E: Multilingual Support', () => {
  let threadId: string;

  beforeAll(() => {
    threadId = `multilingual-${Date.now()}`;
  });

  test('russian_cyrillic_weather_query', async () => {
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Погода в Москве', threadId });

    expect(response.status).toBe(200);
    // Should get some response
  }, 15000);

  test('mixed_language_detection', async () => {
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Weather in 東京', threadId });

    expect(response.status).toBe(200);
    // Should get some response
  }, 15000);
});