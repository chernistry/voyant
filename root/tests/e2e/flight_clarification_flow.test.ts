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

let app: express.Application;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/chat', router);
});

describe('E2E-Graph: Flight Clarification Flow', () => {
  let threadId: string;

  beforeEach(() => {
    threadId = `flight-clarification-${Date.now()}`;
  });

  test('simple_flight_query', async () => {
    const response = await request(app)
      .post('/chat')
      .send({ message: 'flights to Europe', threadId });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reply');
  }, 10000);
});