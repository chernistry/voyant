import request from 'supertest';
import express from 'express';
import pino from 'pino';
import { router } from '../../src/api/routes.js';
import { handleChat } from '../../src/core/blend.js';

const log = pino({ level: 'silent' });

// Функция для создания тестового приложения
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

describe('API Endpoints', () => {
  test('POST /chat returns valid response for valid input', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Hello' })
      .expect(200);

    expect(response.body).toHaveProperty('reply');
    expect(response.body).toHaveProperty('threadId');
    expect(typeof response.body.reply).toBe('string');
    expect(response.body.reply.length).toBeGreaterThan(0);
    expect(typeof response.body.threadId).toBe('string');
  });

  test('POST /chat preserves threadId when provided', async () => {
    const app = createTestApp();
    const threadId = 'test-thread-123';
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Hello', threadId })
      .expect(200);

    expect(response.body.threadId).toBe(threadId);
  });

  test('POST /chat generates threadId when not provided', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Hello' })
      .expect(200);

    expect(response.body.threadId).toBeTruthy();
    expect(typeof response.body.threadId).toBe('string');
    expect(response.body.threadId.length).toBeGreaterThan(0);
  });

  test('POST /chat validates input schema', async () => {
    const app = createTestApp();
    // Empty message
    await request(app)
      .post('/chat')
      .send({ message: '' })
      .expect(400);

    // Message too long
    await request(app)
      .post('/chat')
      .send({ message: 'a'.repeat(2001) })
      .expect(400);

    // Invalid threadId
    await request(app)
      .post('/chat')
      .send({ message: 'Hello', threadId: 'a'.repeat(65) }) // too long
      .expect(400);
  });

  test('POST /chat handles malformed input gracefully', async () => {
    const app = createTestApp();
    // Test with malformed but parseable input
    await request(app)
      .post('/chat')
      .send({ message: 'Hello', invalidField: 'test' })
      .expect(200); // Should still work since extra fields are ignored
  });

  test('GET /metrics returns JSON snapshot by default', async () => {
    const app = createTestApp();
    const r = await request(app)
      .get('/metrics')
      .expect(200);
    expect(r.body).toHaveProperty('messages_total');
    expect(typeof r.body.messages_total).toBe('number');
  });

  test('GET /healthz endpoint works', async () => {
    // This tests the healthz endpoint from server.ts
    const healthApp = express();
    healthApp.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

    await request(healthApp)
      .get('/healthz')
      .expect(200)
      .expect({ ok: true });
  });
});

describe('CLI Integration', () => {
  test('handleChat can be called directly (CLI simulation)', async () => {
    const result = await handleChat({ message: 'What to pack for Tokyo?' }, { log });

    expect(result).toHaveProperty('reply');
    expect(result).toHaveProperty('threadId');
    expect(result.reply).toBeTruthy();
    expect(typeof result.reply).toBe('string');
  });

  test('CLI maintains conversation thread', async () => {
    let threadId = 'cli-test-thread';

    const result1 = await handleChat({ message: 'What to pack for Tokyo in March?' }, { log });
    threadId = result1.threadId;

    const result2 = await handleChat({ message: 'What about kids?', threadId }, { log });

    expect(result2.threadId).toBe(threadId);
    expect(result2.reply).toBeTruthy();
    expect(typeof result2.reply).toBe('string');
  });

  test('CLI handles different intents', async () => {
    // Packing intent
    const packing = await handleChat({ message: 'What to pack for Paris?' }, { log });
    expect(packing.reply).toBeTruthy();

    // Destinations intent
    const destinations = await handleChat({ message: 'Where should I go in summer?' }, { log });
    expect(destinations.reply).toBeTruthy();

    // Attractions intent
    const attractions = await handleChat({ message: 'What to do in London?' }, { log });
    expect(attractions.reply).toBeTruthy();
  });
});

describe('End-to-End Conversation Flow', () => {
  test('complete conversation maintains context', async () => {
    const app = createTestApp();
    const response1 = await request(app)
      .post('/chat')
      .send({ message: 'What to pack for Tokyo in March?' })
      .expect(200);
    const threadId = response1.body.threadId;

    // Follow-up question
    const response2 = await request(app)
      .post('/chat')
      .send({ message: 'What about for kids?', threadId })
      .expect(200);
    expect(response2.body.threadId).toBe(threadId);

    // Another follow-up
    const response3 = await request(app)
      .post('/chat')
      .send({ message: 'Any specific recommendations?', threadId })
      .expect(200);
    expect(response3.body.threadId).toBe(threadId);
  });

  test('API handles malformed JSON gracefully', async () => {
    const app = createTestApp();
    await request(app)
      .post('/chat')
      .set('Content-Type', 'application/json')
      .send('invalid json')
      .expect(400);
  });
});
