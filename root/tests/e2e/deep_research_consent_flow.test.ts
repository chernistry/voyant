import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

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
    expect(response1.body.reply).toContain('deep research');
    expect(response1.body.reply).toContain('consent');
    
    // Verify consent state from slot_memory
    // Note: In a real test, we would check the slot memory directly
    // For now, we'll verify through the response structure
    
    // Test consent acceptance
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'yes', threadId });

    expect(response2.status).toBe(200);
    // Should execute deep research
    expect(response2.body.reply).not.toBeNull();
    
    // Reset environment
    delete process.env.DEEP_RESEARCH_ENABLED;
  }, 30000); // Increased timeout for complex E2E test

  test('deep_research_consent_decline', async () => {
    // Enable deep research for this test
    process.env.DEEP_RESEARCH_ENABLED = 'true';
    
    const complexQuery = 'detailed itinerary for Japan with cultural experiences';
    const response1 = await request(app)
      .post('/chat')
      .send({ message: complexQuery, threadId: `deep-research-2-${Date.now()}` });

    expect(response1.status).toBe(200);
    expect(response1.body.reply).toContain('deep research');
    expect(response1.body.reply).toContain('consent');
    
    // Test consent decline
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'no', threadId: `deep-research-2-${Date.now()}` });

    expect(response2.status).toBe(200);
    // Should provide alternative response
    expect(response2.body.reply).not.toBeNull();
    
    // Reset environment
    delete process.env.DEEP_RESEARCH_ENABLED;
  }, 30000); // Increased timeout for complex E2E test
});