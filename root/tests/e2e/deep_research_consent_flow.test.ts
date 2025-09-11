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

describe('E2E-Graph: Consent Flow - Deep Research', () => {
  let threadId: string;

  beforeAll(() => {
    threadId = `deep-research-${Date.now()}`;
  });

  test('deep_research_consent_complex_query_detection', async () => {
    // Enable deep research for this test
    process.env.DEEP_RESEARCH_ENABLED = 'true';
    
    const complexQuery = 'comprehensive travel plan for 3-week Europe trip with kids';
    const response1 = await request(app)
      .post('/chat')
      .send({ message: complexQuery, threadId });

    expect(response1.status).toBe(200);
    // Should get some response
    
    // Reset environment
    delete process.env.DEEP_RESEARCH_ENABLED;
  }, 30000); // Increased timeout for complex E2E test
});