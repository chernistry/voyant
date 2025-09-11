import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

const app = express();
app.use(express.json());
app.use('/chat', router);

describe('E2E-Graph: Flight Clarification Flow', () => {
  let threadId: string;

  beforeAll(() => {
    threadId = `flight-clarification-${Date.now()}`;
  });

  test('flight_search_with_clarification', async () => {
    // Test: Initial ambiguous flight query that triggers clarification
    const response1 = await request(app)
      .post('/chat')
      .send({ message: 'flights to Europe', threadId });

    expect(response1.status).toBe(200);
    expect(response1.body.reply).toContain('clarification');
    expect(response1.body.reply).toMatch(/direct search|travel research/i);
    
    // Test: User chooses direct search path
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'direct search', threadId });

    expect(response2.status).toBe(200);
    expect(response2.body.intent).toBe('flights');
    expect(response2.body.needExternal).toBe(true);
    
    // Test: Another ambiguous query that triggers clarification
    const response3 = await request(app)
      .post('/chat')
      .send({ message: 'I want to fly somewhere warm', threadId: `flight-clarification-2-${Date.now()}` });

    expect(response3.status).toBe(200);
    expect(response3.body.reply).toContain('clarification');
    expect(response3.body.reply).toMatch(/direct search|travel research/i);
    
    // Test: User chooses travel research path
    const response4 = await request(app)
      .post('/chat')
      .send({ message: 'travel research', threadId: `flight-clarification-2-${Date.now()}` });

    expect(response4.status).toBe(200);
    expect(response4.body.intent).toBe('web_search');
    expect(response4.body.needExternal).toBe(true);
  }, 30000); // Increased timeout for complex E2E test
});