import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import nock from 'nock';
import { router } from '../../src/api/routes.js';
import pino from 'pino';

function createTestApp(): express.Express {
  const log = pino({ level: 'silent' });
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

describe('Brave Search Fallback Tests', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.FORCE_WEATHER_FAILURE;
    delete process.env.FORCE_COUNTRY_FAILURE;
    delete process.env.FORCE_ATTRACTIONS_FAILURE;
  });

  describe('Weather Fallback', () => {
    test('falls back to Brave Search when weather API fails', async () => {
      // Mock weather API failure
      nock('https://geocoding-api.open-meteo.com')
        .get(/.*/)
        .reply(503);
      
      nock('https://api.open-meteo.com')
        .get(/.*/)
        .reply(503);

      // Mock Brave Search success
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Tokyo Weather Forecast',
                url: 'https://example.com/weather',
                description: 'Tokyo weather today: High 25°C, Low 18°C with sunny conditions'
              }
            ]
          }
        });

      const response = await request(app)
        .post('/chat')
        .send({ message: 'Weather in Tokyo?' })
        .expect(200);
    
      expect(response.body.reply).toContain('Tokyo');
      expect(response.body.reply).toContain('25');
      expect(response.body.citations).toContain('Brave Search');
    }, 45000);
  });

  describe('Country Facts Fallback', () => {
    test('falls back to Brave Search when country API fails', async () => {
      // Mock geocoding success but REST Countries failure
      nock('https://geocoding-api.open-meteo.com')
        .get(/.*/)
        .reply(200, { results: [{ country: 'Japan' }] });
      
      nock('https://restcountries.com')
        .get(/.*/)
        .reply(503);

      // Mock Brave Search success
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Japan Travel Information',
                url: 'https://example.com/japan',
                description: 'Japan travel info: Currency is Japanese Yen, official language is Japanese'
              }
            ]
          }
        });

      const response = await request(app)
        .post('/chat')
        .send({ message: 'Where should I go in June from Tokyo?', threadId: 'test-country-fallback' })
        .expect(200);

      expect(response.body.reply).toContain('Japan');
      expect(response.body.citations).toContain('Brave Search');
    }, 45000);
  });

  describe('Attractions Fallback', () => {
    test('falls back to Brave Search when attractions API fails', async () => {
      // Simulate attractions API unavailability (OpenTripMap or similar)
      // Not strictly necessary since missing OPENTRIPMAP_API_KEY triggers fallback, but we keep it explicit
      nock('https://api.opentripmap.com')
        .get(/.*/)
        .reply(503);

      // Mock Brave Search success
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Top 10 Paris Attractions',
                url: 'https://example.com/paris',
                description: 'Visit the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral in Paris'
              },
              {
                title: 'Eiffel Tower',
                url: 'https://example.com/eiffel',
                description: 'Famous iron lattice tower in Paris'
              }
            ]
          }
        });

      const response = await request(app)
        .post('/chat')
        .send({ message: 'What to do in Paris?' })
        .expect(200);
    
      expect(response.body.reply).toContain('Paris');
      expect(response.body.citations).toContain('Brave Search');
    }, 45000);
  });

  describe('Enhanced Retry Strategy', () => {
    test('retries with exponential backoff before falling back', async () => {
      let attemptCount = 0;
      
      // Mock API to fail 3 times then succeed
      nock('https://geocoding-api.open-meteo.com')
        .get(/.*/)
        .times(3)
        .reply(() => {
          attemptCount++;
          return [503, 'Service Unavailable'];
        });

      nock('https://geocoding-api.open-meteo.com')
        .get(/.*/)
        .reply(200, { results: [{ latitude: 35.6762, longitude: 139.6503, country: 'Japan' }] });

      nock('https://api.open-meteo.com')
        .get(/.*/)
        .reply(200, { daily: { temperature_2m_max: [25], temperature_2m_min: [18], precipitation_probability_mean: [10] } });

      const response = await request(app)
        .post('/chat')
        .send({ message: 'Weather in Tokyo?' })
        .expect(200);
    
      expect(attemptCount).toBe(3); // Should have retried 3 times
      expect(response.body.reply).toContain('25°C');
      expect(response.body.citations).toContain('Open-Meteo');
    }, 20000);
  });

  describe('Multiple API Failures', () => {
    test('handles multiple API failures with appropriate fallbacks', async () => {
      // Mock all primary APIs failing
      nock('https://geocoding-api.open-meteo.com')
        .get(/.*/)
        .reply(503);
      
      nock('https://api.open-meteo.com')
        .get(/.*/)
        .reply(503);
      
      nock('https://restcountries.com')
        .get(/.*/)
        .reply(503);

      // Mock Brave Search success for multiple queries
      nock('https://api.search.brave.com')
        .get('/res/v1/web/search')
        .query(true)
        .times(2)
        .reply(200, {
          web: {
            results: [
              {
                title: 'Tokyo Travel Guide',
                url: 'https://example.com/tokyo',
                description: 'Tokyo weather: 22-28°C in June. Currency: Japanese Yen. Language: Japanese.'
              }
            ]
          }
        });

      const response = await request(app)
        .post('/chat')
        .send({ message: 'Where should I go in June from Tokyo?', threadId: 'test-multiple-fallback' })
        .expect(200);
    
      expect(response.body.reply).toContain('Tokyo');
      expect(response.body.citations).toContain('Brave Search');
    }, 20000);
  });
});
