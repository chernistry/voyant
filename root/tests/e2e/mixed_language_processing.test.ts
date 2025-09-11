import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

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
    expect(response.body.reply).toContain('Moscow');
    expect(response.body.reply).toContain('weather');
  }, 15000);

  test('mixed_language_detection', async () => {
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Weather in 東京', threadId });

    expect(response.status).toBe(200);
    // Should detect mixed languages and add a note
    expect(response.body.reply).toMatch(/Note: I work best with English/i);
    expect(response.body.reply).toContain('Tokyo');
  }, 15000);

  test('mixed_cyrillic_and_latin', async () => {
    const response = await request(app)
      .post('/chat')
      .send({ message: 'Погода in Paris s\'il vous plaît', threadId: `multilingual-2-${Date.now()}` });

    expect(response.status).toBe(200);
    // Should detect mixed languages and add a note
    expect(response.body.reply).toMatch(/Note: I work best with English/i);
    expect(response.body.reply).toContain('Paris');
  }, 15000);
});