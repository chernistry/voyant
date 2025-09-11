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
    // Should provide a graceful fallback response
    expect(response1.body.reply).toContain('couldn\'t find');
    expect(response1.body.reply).toContain('weather');
    
    // Test: Continue conversation after failure
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'What should I pack for London then?', threadId });

    expect(response2.status).toBe(200);
    // Should continue with general packing advice even after weather API failure
    expect(response2.body.reply).toContain('pack');
  }, 15000);

  test('api_failure_during_complex_conversation', async () => {
    // Test: Complex conversation with multiple API calls where one fails
    const response1 = await request(app)
      .post('/chat')
      .send({ message: 'I\'m planning a trip to Paris in June. What\'s the weather there?', threadId: `error-recovery-2-${Date.now()}` });

    expect(response1.status).toBe(200);
    // Should gracefully handle weather API failure
    expect(response1.body.reply).toContain('couldn\'t find');
    
    // Test: Continue with packing questions
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'What should I pack for Paris in June?', threadId: `error-recovery-2-${Date.now()}` });

    expect(response2.status).toBe(200);
    // Should still provide packing advice
    expect(response2.body.reply).toContain('pack');
    
    // Test: Ask about attractions
    const response3 = await request(app)
      .post('/chat')
      .send({ message: 'What are some attractions in Paris?', threadId: `error-recovery-2-${Date.now()}` });

    expect(response3.status).toBe(200);
    // Should provide fallback response for attractions
    expect(response3.body.reply).toContain('couldn\'t find');
    expect(response3.body.reply).toContain('attraction');
  }, 30000); // Increased timeout for complex E2E test
});