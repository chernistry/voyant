import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import pino from 'pino';
import nock from 'nock';
import { router } from '../src/api/routes.js';
import { expectLLMEvaluation } from '../src/test/llm-evaluator.js';
import { TranscriptRecorder } from '../src/test/transcript-recorder.js';
import { recordedRequest } from '../src/test/transcript-helper.js';

// Configure nock to work with undici
nock.disableNetConnect();
nock.enableNetConnect((host) => {
  // Allow local server and LLM provider
  if (host.includes('127.0.0.1') || host.includes('localhost') || host.includes('openrouter.ai')) return true;
  // Allow real travel/data APIs used by the agent for e2e flows
  if (host.includes('api.open-meteo.com')) return true;
  if (host.includes('geocoding-api.open-meteo.com')) return true;
  if (host.includes('restcountries.com')) return true;
  if (host.includes('api.opentripmap.com')) return true;
  if (host.includes('api.search.brave.com')) return true;
  return false;
});

const log = pino({ level: process.env.LOG_LEVEL ?? 'debug' });

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

// Enable debug logging for this test
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

// Check if transcripts should be saved (enable with --save-transcripts or --with-transcripts)
const shouldSaveTranscripts = process.argv.includes('--save-transcripts') || process.argv.includes('--with-transcripts');

// Helper function that uses recordedRequest if transcripts should be saved, otherwise regular request
function makeRequest(app: express.Express, transcriptRecorder?: TranscriptRecorder) {
  return {
    post: (path: string) => {
      const req = request(app).post(path);
      return {
        set: (header: string, value: string) => {
          req.set(header, value);
          return {
            send: (data: any) => ({
              expect: (status: number) => {
                if (shouldSaveTranscripts && transcriptRecorder) {
                  // Generate a unique test name based on the message
                  const testName = data.message ? data.message.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_') : 'test_request';
                  return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
                } else {
                  return req.send(data).expect(status);
                }
              }
            })
          };
        },
        send: (data: any) => ({
          expect: (status: number) => {
            if (shouldSaveTranscripts && transcriptRecorder) {
              // Generate a unique test name based on the message
              const testName = data.message ? data.message.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_') : 'test_request';
              return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
            } else {
              return req.send(data).expect(status);
            }
          }
        })
      };
    },
    get: (path: string) => ({
      expect: (status: number) => request(app).get(path).expect(status)
    })
  };
}

describe('E2E Comprehensive User Journey Tests', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder;

  beforeAll(() => {
    if (shouldSaveTranscripts) {
      transcriptRecorder = new TranscriptRecorder();
      console.log('📝 Transcript saving enabled');
    } else {
      console.log('📝 Transcript saving disabled (use --save-transcripts to enable)');
    }
  });

  afterAll(async () => {
    if (transcriptRecorder) {
      await transcriptRecorder.saveTranscripts();
      console.log('💾 Transcripts saved to deliverables/transcripts/');
    }
  });

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('🌍 Basic Weather & City Queries', () => {
    test('handles standard weather query', async () => {
      // Mock geocoding API
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France' }] });
      
      // Mock weather API
      nock('https://api.open-meteo.com')
        .get('/v1/forecast')
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [22], temperature_2m_min: [15], precipitation_probability_mean: [20] } });

      const r = await recordedRequest(app, transcriptRecorder, 'standard_weather_query', 'What is the weather like in Paris?');

      await expectLLMEvaluation(
        'Weather query for Paris',
        r.body.reply,
        'Response should provide weather information for Paris (current weather is acceptable without asking for dates)'
      ).toPass();
    }, 45000);

    test('handles misspelled cities', async () => {
      // Mock geocoding API for misspelled city
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'London', latitude: 51.5074, longitude: -0.1278, country: 'United Kingdom' }] });
      
      // Mock weather API
      nock('https://api.open-meteo.com')
        .get('/v1/forecast')
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [18], temperature_2m_min: [12], precipitation_probability_mean: [30] } });

      const r = await recordedRequest(app, transcriptRecorder, 'misspelled_city_query', 'Weather in Lodon?');

      await expectLLMEvaluation(
        'Misspelled city query (Lodon instead of London)',
        r.body.reply,
        'Response should handle the misspelled city gracefully, either correcting it or asking for clarification'
      ).toPass();
    }, 45000);

    test('handles city abbreviations', async () => {
      // Mock geocoding API for NYC
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }] });
      
      // Mock weather API
      nock('https://api.open-meteo.com')
        .get('/v1/forecast')
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [28], temperature_2m_min: [18], precipitation_probability_mean: [10] } });

      const r = await recordedRequest(app, transcriptRecorder, 'city_abbreviation_query', 'Weather in NYC in June?');

      await expectLLMEvaluation(
        'City abbreviation query (NYC) with month',
        r.body.reply,
        'Response should understand NYC refers to New York City and provide weather information for June or ask for more specific dates'
      ).toPass();
    }, 45000);
  });

  describe('🎒 Packing Suggestions', () => {
    test('basic packing queries', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'basic_packing_query', 'What to pack for Paris in June?');

      await expectLLMEvaluation(
        'Packing query for Paris in June',
        r.body.reply,
        'Response should provide packing suggestions appropriate for Paris in June, considering weather and activities'
      ).toPass();
    }, 45000);

    test('packing with special circumstances', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'packing_with_kids', 'What to pack for Tokyo if I have kids?');

      await expectLLMEvaluation(
        'Packing query for Tokyo with kids',
        r.body.reply,
        'Response should ask for travel dates or provide family-friendly packing suggestions for Tokyo'
      ).toPass();
    }, 45000);
  });

  describe('🏛️ Attractions & Activities', () => {
    test('attractions queries with OpenTripMap API', async () => {
      // Mock OpenTripMap geocoding
      nock('https://api.opentripmap.com')
        .get('/0.1/en/places/geoname')
        .query(true)
        .reply(200, { name: 'Tokyo', lat: 35.6762, lon: 139.6503, country: 'JP' });
      
      // Mock OpenTripMap POI search (geojson format)
      nock('https://api.opentripmap.com')
        .get('/0.1/en/places/radius')
        .query(true)
        .reply(200, {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                xid: 'N123456',
                name: 'Tokyo Tower',
                kinds: 'towers,tourist_facilities',
                dist: 100
              },
              geometry: {
                type: 'Point',
                coordinates: [139.6503, 35.6762]
              }
            },
            {
              type: 'Feature',
              properties: {
                xid: 'N789012',
                name: 'Senso-ji Temple',
                kinds: 'temples,cultural',
                dist: 200
              },
              geometry: {
                type: 'Point',
                coordinates: [139.6503, 35.6762]
              }
            }
          ]
        });

      const r = await recordedRequest(app, transcriptRecorder, 'attractions_tokyo_opentripmap', 'What attractions are there in Tokyo?');

      await expectLLMEvaluation(
        'Attractions query for Tokyo using real OpenTripMap API',
        r.body.reply,
        'Response should provide real POI information from OpenTripMap API with actual attraction names, descriptions, and cite OpenTripMap as the source'
      ).toPass();

      // Check that we get some form of citation (OpenTripMap or Brave Search)
      expect(r.body.citations).toBeDefined();
      expect(Array.isArray(r.body.citations)).toBe(true);
    }, 45000);

    test('attractions in different cities with OpenTripMap', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_paris_opentripmap', 'What to do in Paris?');

      await expectLLMEvaluation(
        'Attractions query for Paris using real OpenTripMap API',
        r.body.reply,
        'Response should provide real Paris attractions from OpenTripMap API, not generic or LLM-generated content, with proper source citation'
      ).toPass();

      // Verify we get a response with some structure
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
      expect(r.body.reply.length).toBeGreaterThan(10);
    }, 45000);

    test('attractions handles unknown cities gracefully', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_unknown_city', 'What to do in Fakecityville?');

      await expectLLMEvaluation(
        'Attractions query for unknown city',
        r.body.reply,
        'Response should handle unknown/non-existent cities gracefully, either asking for clarification or providing helpful guidance about travel planning'
      ).toPass();
    }, 45000);

    test('attractions in major tourist destinations', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_rome_opentripmap', 'What attractions are in Rome?');

      await expectLLMEvaluation(
        'Attractions query for Rome using OpenTripMap API',
        r.body.reply,
        'Response should provide authentic Rome attractions from OpenTripMap API, focusing on historical sites, landmarks, and tourist destinations'
      ).toPass();

      // Ensure we get proper citations
      expect(r.body.citations).toBeDefined();
    }, 45000);
  });

  describe('🔄 Intent Switching', () => {
    test('switch from weather to packing', async () => {
      const threadId = 'test-switch-1';

      // First query: weather with city and month
      const r1 = await recordedRequest(app, transcriptRecorder, 'intent_switch_weather_to_packing_step1', 'Weather in Paris in June?', threadId);

      // Second query: packing (should remember Paris and June)
      const r2 = await recordedRequest(app, transcriptRecorder, 'intent_switch_weather_to_packing_step2', 'What should I pack?', threadId);

      await expectLLMEvaluation(
        'Context switching from weather to packing for Paris',
        r2.body.reply,
        'Response should provide packing suggestions for Paris in June, showing it remembered both city and month from previous context'
      ).toPass();
    }, 45000);

    test('switch from attractions to weather', async () => {
      const threadId = 'test-switch-2';

      // First query: attractions with city (real OpenTripMap API)
      const r1 = await recordedRequest(app, transcriptRecorder, 'intent_switch_attractions_to_weather_step1', 'Things to do in Barcelona?', threadId);

      // Second query: weather (should remember Barcelona from attractions context)
      const r2 = await recordedRequest(app, transcriptRecorder, 'intent_switch_attractions_to_weather_step2', 'How is the weather there in summer?', threadId);

      await expectLLMEvaluation(
        'Context switching from attractions to weather for Barcelona',
        r2.body.reply,
        'Response should provide weather information for Barcelona in summer, showing it remembered the city from previous attractions context'
      ).toPass();
    }, 45000);
  });

  describe('🌐 Multilingual Scenarios', () => {
    test('mixed language conversation', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Погода в Москве в июне' }).expect(200);

      await expectLLMEvaluation(
        'Russian language weather query for Moscow in June',
        r.body.reply,
        'Response should handle the Russian query appropriately, either providing weather info for Moscow in June or asking for clarification in English'
      ).toPass();
    }, 45000);

    test('Spanish attractions query', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '¿Qué hacer en Barcelona?' }).expect(200);

      await expectLLMEvaluation(
        'Spanish attractions query for Barcelona',
        r.body.reply,
        'Response should handle Spanish query and provide real Barcelona attractions from OpenTripMap API with proper citation, focusing on authentic tourist destinations'
      ).toPass();

      // Check that we get citations
      expect(r.body.citations).toBeDefined();
      expect(Array.isArray(r.body.citations)).toBe(true);
    }, 45000);
  });

  describe('❓ Clarification Discipline', () => {
    test('packing clarifier when month/dates missing', async () => {
      const r1 = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Tokyo?' }).expect(200);
      await expectLLMEvaluation(
        'Packing clarifier for Tokyo without dates',
        r1.body.reply,
        'Response should ask a single targeted question about month or travel dates'
      ).toPass();
      const qMarks = (String(r1.body.reply).match(/\?/g) || []).length;
      expect(qMarks).toBeGreaterThanOrEqual(1);
      expect(qMarks).toBeLessThanOrEqual(2);

      const r2 = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'March.', threadId: r1.body.threadId }).expect(200);
      await expectLLMEvaluation(
        'Packing follow-up for Tokyo in March',
        r2.body.reply,
        'Response should provide packing suggestions tailored to March temps and precipitation in Tokyo'
      ).toPass();
    }, 45000);
  });

  describe('👪 Family/Kid-friendly Refinements', () => {
    test('destinations → kid-friendly refinement keeps context', async () => {
      const threadId = 'kid-friendly-ctx-1';
      const r1 = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where should I go in June from NYC?', threadId }).expect(200);
      await expectLLMEvaluation(
        'Initial destinations from NYC in June',
        r1.body.reply,
        'Response should offer 2-4 destination options with June weather rationale'
      ).toPass();

      const r2 = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Make it kid-friendly.', threadId }).expect(200);
      await expectLLMEvaluation(
        'Kid-friendly refinement reusing prior context (NYC + June)',
        r2.body.reply,
        'Response should keep same thread context and add family/kid-friendly notes to destinations'
      ).toPass();
      expect(r2.body.threadId).toBe(threadId);
    }, 45000);
  });

  describe('🔤 Input Variance & Noise', () => {
    test('typos are tolerated', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Wher shud I go in Jnne from NYC?' }).expect(200);
      await expectLLMEvaluation(
        'Typos in destinations query for June from NYC',
        r.body.reply,
        'Response should robustly interpret the intent (destinations in June from NYC) despite typos'
      ).toPass();
    }, 45000);

    test('emojis and punctuationless input', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'what to pack for tokyo in march 🤔' }).expect(200);
      await expectLLMEvaluation(
        'Emoji and lowercase packing query for Tokyo in March',
        r.body.reply,
        'Response should provide packing guidance including layers or rain protection for March in Tokyo'
      ).toPass();
    }, 45000);
  });

  describe('🧵 Long Thread Coherence & New Thread Isolation', () => {
    test('long thread keeps constraints coherent', async () => {
      const tid = 'long-thread-ctx-1';
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where to go in June from NYC?', threadId: tid }).expect(200);
      for (let i = 0; i < 9; i++) {
        await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'shorten flight time please', threadId: tid }).expect(200);
      }
      const final = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Make it kid-friendly', threadId: tid }).expect(200);
      await expectLLMEvaluation(
        'After many turns, still honors kid-friendly refinement',
        final.body.reply,
        'Response should reflect family/kid-friendly adjustments without losing prior June/NYC context'
      ).toPass();
    }, 45000);

    test('new thread does not inherit old context', async () => {
      const a = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where to go in June from NYC?' }).expect(200);
      const b = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Make it kid-friendly' }).expect(200);
      await expectLLMEvaluation(
        'New thread without prior context',
        b.body.reply,
        'Response should request missing city or month/budget instead of assuming NYC or June'
      ).toPass();
    }, 45000);
  });

  describe('🛡️ CoT Safety', () => {
    test('no chain-of-thought leakage', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Packing list for Tokyo in March? Explain briefly.' }).expect(200);
      const leakMarkers = [/chain[-\s]?of[-\s]?thought/i, /\breasoning:/i, /step\s*\d+/i];
      leakMarkers.forEach((re) => expect(re.test(String(r.body.reply))).toBeFalsy());
    }, 15000);
  });

  describe('🚨 Error Handling & Edge Cases', () => {
    test('handles non-existent cities gracefully', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Weather in Nonexistentville?' }).expect(200);

      await expectLLMEvaluation(
        'Non-existent city query',
        r.body.reply,
        'Response should gracefully handle the non-existent city, asking for a valid city name or providing helpful guidance'
      ).toPass();
    }, 45000);

    test('handles very long messages', async () => {
      const longMessage = 'I am planning a trip to Paris and I want to know ' + 'what to pack '.repeat(20) + 'for my journey in June with my family.';

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: longMessage }).expect(200);

      await expectLLMEvaluation(
        'Very long message about Paris trip planning',
        r.body.reply,
        'Response should handle the long message appropriately, extracting key information (Paris, June, family) and providing relevant travel advice'
      ).toPass();
    }, 45000);

    test('handles malformed JSON gracefully', async () => {
      await makeRequest(app, transcriptRecorder)
        .post('/chat')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    test('handles empty messages', async () => {
      await makeRequest(app, transcriptRecorder)
        .post('/chat')
        .send({ message: '' })
        .expect(400);
    });

    test('handles very long threadIds', async () => {
      await makeRequest(app, transcriptRecorder)
        .post('/chat')
        .send({ message: 'Hello', threadId: 'a'.repeat(65) })
        .expect(400);
    });
  });

  describe('🔧 External API Failure Scenarios', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    test('weather API timeout fallback', async () => {
      nock('https://api.open-meteo.com')
        .get(/.*/)
        .delay(5000) // Exceeds 4s timeout
        .reply(200, {});

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Tokyo in March?' }).expect(200);

      await expectLLMEvaluation(
        'Packing query with weather API timeout',
        r.body.reply,
        'Response should provide helpful packing advice for Tokyo in March, either with or without specific weather data'
      ).toPass();

      // Should contain packing-related content
      expect(String(r.body.reply).toLowerCase()).toMatch(/pack|bring|clothes|jacket/i);
    }, 45000);

    test('attractions API error handling', async () => {
      // This test will use real APIs - if OpenTripMap fails, it should fall back gracefully
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What attractions are in London?' }).expect(200);

      await expectLLMEvaluation(
        'Attractions query with potential API errors',
        r.body.reply,
        'Response should handle any API errors gracefully, either providing attractions from working APIs or asking for clarification, with appropriate citations'
      ).toPass();

      // Should have some response
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
    }, 45000);

    test('country API empty response', async () => {
      nock('https://restcountries.com')
        .get(/.*/)
        .reply(200, {});

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where should I go in June from NYC?' }).expect(200);

      await expectLLMEvaluation(
        'Destinations query with empty country API response',
        r.body.reply,
        'Response should handle empty country data gracefully, providing reasonable destination suggestions'
      ).toPass();
    }, 45000);

    test('multiple API failures', async () => {
      nock('https://api.open-meteo.com').get(/.*/).reply(503);
      nock('https://restcountries.com').get(/.*/).reply(503);
      // Mock geocoding failure
      nock('https://geocoding-api.open-meteo.com').get(/.*/).reply(503);
      // Mock OpenTripMap failure
      nock('https://api.opentripmap.com').get(/.*/).reply(503);
      // Mock Brave Search failure
      nock('https://api.search.brave.com').get(/.*/).reply(503);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to do in Tokyo in March?' }).expect(200);

      await expectLLMEvaluation(
        'Query with all APIs failing',
        r.body.reply,
        'Response should handle multiple API failures gracefully, providing helpful general advice without fabricated data'
      ).toPass();
    }, 45000);
  });

  describe('📚 Citations & Sources', () => {
    test('includes citations when external facts are used (packing/weather success)', async () => {
      // Geocoding → Paris
      nock('https://geocoding-api.open-meteo.com')
        .get(/\/v1\/search.*/)
        .query(true)
        .reply(200, { results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France' }] });
      // Weather
      nock('https://api.open-meteo.com')
        .get(/\/v1\/forecast.*/)
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [24], temperature_2m_min: [14], precipitation_probability_mean: [20] } });

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Paris in March?' }).expect(200);
      expect(Array.isArray(r.body.citations) || r.body.citations === undefined).toBeTruthy();
      // Should include Open-Meteo when weather succeeded
      expect((r.body.citations || []).join(',')).toMatch(/Open-Meteo/i);
    }, 45000);

    test('includes citations for destinations when country facts and weather succeed', async () => {
      const threadId = 'citations-dest-1';
      
      // Clear any existing nocks
      nock.cleanAll();
      
      // Geocoding → NYC → United States (for weather API)
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }] });
      
      // Geocoding → NYC → United States (for country API)
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }] });
      
      // Weather for NYC
      nock('https://api.open-meteo.com')
        .get('/v1/forecast')
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [28], temperature_2m_min: [20], precipitation_probability_mean: [10] } });
      
      // REST Countries → United States
      nock('https://restcountries.com')
        .get('/v3.1/name/United%20States')
        .query({ fields: 'name,currencies,languages,region' })
        .reply(200, [{ name: { common: 'United States' }, currencies: { USD: {} }, languages: { eng: 'English' }, region: 'Americas' }]);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where should I go in June from NYC?', threadId }).expect(200);
      const cits = r.body.citations || [];
      expect(cits.join(',')).toMatch(/Open-Meteo/i);
      expect(cits.join(',')).toMatch(/REST Countries/i);
    }, 45000);

    test('does not fabricate citations when all external APIs fail', async () => {
      nock('https://geocoding-api.open-meteo.com').get(/.*/).reply(503);
      nock('https://api.open-meteo.com').get(/.*/).reply(503);
      nock('https://restcountries.com').get(/.*/).reply(503);
      nock('https://api.opentripmap.com').get(/.*/).reply(503);
      nock('https://api.search.brave.com').get(/.*/).reply(503);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Tokyo in March?' }).expect(200);
      expect(r.body.citations).toBeUndefined();
    }, 45000);
  });

  describe('🧭 Clarifiers & Slot Discipline (additional)', () => {
    test('attractions without city asks specifically for city', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to do?' }).expect(200);
      expect(String(r.body.reply)).toMatch(/Which city/i);
    }, 15000);

    test('destinations with city but missing dates asks for month/dates', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where should I go from NYC?' }).expect(200);
      expect(String(r.body.reply)).toMatch(/Which month or travel dates\?/i);
    }, 15000);
  });

  describe('🗓️ Seasons & Immediate Time', () => {
    test('"today" avoids date clarifier (packing)', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'what to wear in Paris today?' }).expect(200);
      expect(String(r.body.reply)).not.toMatch(/Which month or travel dates\?/i);
      await expectLLMEvaluation(
        'Packing today in Paris',
        r.body.reply,
        'Response should provide immediate packing guidance without asking for dates'
      ).toPass();
    }, 45000);

    test('season terms (winter) count as time context and avoid clarifier', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Oslo in winter?' }).expect(200);
      expect(String(r.body.reply)).not.toMatch(/Which month or travel dates\?/i);
      await expectLLMEvaluation(
        'Packing for Oslo in winter',
        r.body.reply,
        'Response should provide cold-weather packing suggestions and avoid asking for dates'
      ).toPass();
    }, 45000);
  });

  describe('🔁 Extended Intent Switching', () => {
    test('weather → attractions → destinations keeps context', async () => {
      const threadId = 'triple-switch-1';

      // Step 1: weather
      nock('https://geocoding-api.open-meteo.com')
        .get(/\/v1\/search.*/)
        .query(true)
        .reply(200, { results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France' }] });
      nock('https://api.open-meteo.com')
        .get(/\/v1\/forecast.*/)
        .query(true)
        .reply(200, { daily: { temperature_2m_max: [24], temperature_2m_min: [14], precipitation_probability_mean: [20] } });
      await recordedRequest(app, transcriptRecorder, 'extended_intent_switch_weather_step', 'Weather in Paris in June?', threadId);

      // Step 2: attractions (reuse city from context) - mock OpenTripMap
      nock('https://api.opentripmap.com')
        .get(/\/0\.1\/en\/places\/radius.*/)
        .reply(200, {
          features: [
            {
              properties: { xid: 'P1', name: 'Eiffel Tower', kinds: 'architecture,towers' },
              geometry: { coordinates: [2.2945, 48.8584] }
            },
            {
              properties: { xid: 'P2', name: 'Louvre Museum', kinds: 'cultural,museums' },
              geometry: { coordinates: [2.3376, 48.8606] }
            }
          ]
        });
      const a = await recordedRequest(app, transcriptRecorder, 'extended_intent_switch_attractions_step', 'What to do there?', threadId);
      await expectLLMEvaluation(
        'Switching to attractions with context',
        a.body.reply,
        'Response should provide real Paris attractions from OpenTripMap API (Eiffel Tower, Louvre Museum) and cite OpenTripMap as source'
      ).toPass();

      // Check that OpenTripMap is cited for attractions
      expect((a.body.citations || []).join(',')).toMatch(/OpenTripMap/i);

      // Step 3: destinations (reuse city + month from context)
      // REST Countries for France (country facts may be used based on source city)
      nock('https://restcountries.com')
        .get(/\/v3\.1\/name\/France.*/)
        .reply(200, [{ name: { common: 'France' }, currencies: { EUR: {} }, languages: { fra: 'French' }, region: 'Europe' }]);
      const d = await recordedRequest(app, transcriptRecorder, 'extended_intent_switch_destinations_step', 'Where else should I go?', threadId);
      await expectLLMEvaluation(
        'Switching to destinations with context',
        d.body.reply,
        'Response should suggest destinations considering Paris context and June, or ask one targeted clarifier'
      ).toPass();
    }, 45000);
  });

  describe('🏙️ Abbreviations & Variants (additional)', () => {
    test('attractions handles city abbreviation (SF)', async () => {
      // Mock geocoding for SF (San Francisco)
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, {
          results: [{ name: 'San Francisco', latitude: 37.7749, longitude: -122.4194, country: 'United States' }]
        });

      // Mock OpenTripMap for SF attractions
      nock('https://api.opentripmap.com')
        .get(/\/0\.1\/en\/places\/radius.*/)
        .reply(200, {
          features: [
            {
              properties: { xid: 'SF1', name: 'Golden Gate Bridge', kinds: 'architecture,bridges' },
              geometry: { coordinates: [-122.4783, 37.8199] }
            },
            {
              properties: { xid: 'SF2', name: 'Alcatraz Island', kinds: 'cultural,historic' },
              geometry: { coordinates: [-122.4230, 37.8267] }
            }
          ]
        });

      const r = await recordedRequest(app, transcriptRecorder, 'attractions_sf_abbreviation', 'What to do in SF?');
      await expectLLMEvaluation(
        'Attractions with SF abbreviation',
        r.body.reply,
        'Response should interpret SF as San Francisco and provide real attractions from OpenTripMap API (Golden Gate Bridge, Alcatraz Island) with OpenTripMap citation'
      ).toPass();

      // Check that OpenTripMap is cited
      expect((r.body.citations || []).join(',')).toMatch(/OpenTripMap/i);
    }, 45000);

    test('weather does not require dates', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: "What's the weather like in Rome?" }).expect(200);
      expect(String(r.body.reply)).not.toMatch(/Which month or travel dates\?/i);
    }, 15000);
  });

  describe('🧪 Metrics endpoint (default behavior)', () => {
    test('metrics endpoint returns JSON snapshot by default', async () => {
      const r = await makeRequest(app, transcriptRecorder).get('/metrics').expect(200);
      expect(r.body).toHaveProperty('messages_total');
      expect(typeof r.body.messages_total).toBe('number');
    }, 10000);
  });

  describe('🤯 Completely Unrelated & Gibberish Queries', () => {
    test('handles completely unrelated questions gracefully', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What is the meaning of life?' }).expect(200);

      console.log('DEBUG: Response for unrelated question:', r.body.reply);

      // For now, just check that we get a response and it's not asking for travel details
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
      expect(r.body.reply.length).toBeGreaterThan(0);

      // Check that it doesn't ask for specific travel details (city/month/dates) which would indicate it's treating this as a travel question
      expect(String(r.body.reply).toLowerCase()).not.toMatch(/city|month|date/i);
      
      // Should indicate it's a travel assistant and redirect to travel topics
      expect(String(r.body.reply).toLowerCase()).toMatch(/travel assistant|travel planning|weather|destinations|packing|attractions/i);
    }, 45000);

    test('handles pure gibberish input', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'asdkfjhaskjdfhlkasjdhfkljashdf' }).expect(200);

      await expectLLMEvaluation(
        'Complete gibberish input',
        r.body.reply,
        'Response should ask for clarification about travel plans or politely indicate it cannot understand the input'
      ).toPass();
    }, 45000);

    test('handles programming/code questions', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'How do I write a React component?' }).expect(200);

      await expectLLMEvaluation(
        'Programming question unrelated to travel',
        r.body.reply,
        'Response should indicate it\'s a travel assistant and suggest focusing on travel-related questions'
      ).toPass();
    }, 45000);

    test('handles medical/health questions', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What medicine should I take for a headache?' }).expect(200);

      await expectLLMEvaluation(
        'Medical question unrelated to travel',
        r.body.reply,
        'Response should politely decline to give medical advice and focus on travel topics'
      ).toPass();
    }, 45000);
  });

  describe('🚫 Empty & Edge Input Messages', () => {
    test('handles whitespace-only messages', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '   \n\t   ' }).expect(200);

      await expectLLMEvaluation(
        'Whitespace-only message',
        r.body.reply,
        'Response should ask for actual travel-related content or indicate it needs more information'
      ).toPass();
    }, 45000);

    test('handles emoji-only messages', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '🤔😊🚀🌟' }).expect(200);

      await expectLLMEvaluation(
        'Emoji-only message',
        r.body.reply,
        'Response should ask for clarification about travel plans or politely indicate it cannot interpret emoji-only messages'
      ).toPass();
    }, 45000);

    test('handles extremely long city names', async () => {
      const longCityName = 'VeryLongCityNameThatDoesNotExistAndShouldBeHandledGracefullyInTheSystem';
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: `Weather in ${longCityName}?` }).expect(200);

      await expectLLMEvaluation(
        'Extremely long city name',
        r.body.reply,
        'Response should handle the long city name gracefully, either correcting it or asking for clarification'
      ).toPass();
    }, 45000);

    test('handles very long messages', async () => {
      const longMessage = 'I want to plan a trip but I have many requirements and preferences '.repeat(20) + ' what do you suggest?';
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: longMessage }).expect(200);

      await expectLLMEvaluation(
        'Very long travel planning message',
        r.body.reply,
        'Response should handle the long message and extract key travel planning elements or ask targeted questions'
      ).toPass();
    }, 45000);
  });

  describe('❓ System & Meta Questions', () => {
    test('handles "who are you" questions', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Who are you?' }).expect(200);

      await expectLLMEvaluation(
        'Identity question',
        r.body.reply,
        'Response should identify itself as a travel assistant and explain its capabilities'
      ).toPass();
    }, 45000);

    test('handles "what can you do" questions', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What can you help me with?' }).expect(200);

      await expectLLMEvaluation(
        'Capabilities question',
        r.body.reply,
        'Response should explain travel-related capabilities (weather, packing, destinations, attractions) and ask about travel plans'
      ).toPass();
    }, 45000);

    test('handles "explain yourself" or "what do you mean" follow-ups', async () => {
      const threadId = 'meta-question-1';

      // First message
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Weather in Paris?', threadId }).expect(200);

      // Meta follow-up
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What do you mean?', threadId }).expect(200);

      await expectLLMEvaluation(
        'Meta question about previous response',
        r.body.reply,
        'Response should clarify what was meant or ask for more specific questions about the travel topic'
      ).toPass();
    }, 45000);
  });

  describe('⚠️ Conflicting Slots & Complex Scenarios', () => {
    test('handles conflicting destination information', async () => {
      const threadId = 'conflicting-1';

      // Establish NYC context
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'From NYC', threadId }).expect(200);

      // Conflicting destination
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'To Tokyo in winter, but also to Paris in summer', threadId }).expect(200);

      await expectLLMEvaluation(
        'Conflicting destination and season information',
        r.body.reply,
        'Response should handle the conflicting information gracefully, perhaps asking to clarify which destination/season is preferred'
      ).toPass();
    }, 45000);

    test('handles impossible travel scenarios', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'How to get from Earth to Mars?' }).expect(200);

      await expectLLMEvaluation(
        'Impossible travel scenario',
        r.body.reply,
        'Response should handle the impossible scenario gracefully, perhaps treating Mars as a destination or asking for clarification'
      ).toPass();
    }, 45000);

    test('handles very short timeframes', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for a 2-hour trip to Paris?' }).expect(200);

      await expectLLMEvaluation(
        'Very short timeframe travel',
        r.body.reply,
        'Response should handle the short timeframe appropriately, perhaps noting it\'s a day trip and adjusting packing recommendations'
      ).toPass();
    }, 45000);
  });

  describe('🔄 Abrupt Topic Changes & Complex Flows', () => {
    test('handles abrupt topic change from travel to unrelated', async () => {
      const threadId = 'abrupt-change-1';

      // Establish travel context
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Weather in Tokyo?', threadId }).expect(200);

      // Abrupt change to unrelated topic
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'How to cook pasta?', threadId }).expect(200);

      await expectLLMEvaluation(
        'Abrupt change from travel to cooking',
        r.body.reply,
        'Response should handle the topic change gracefully, either redirecting back to travel or politely declining unrelated topics'
      ).toPass();
    }, 45000);

    test('handles multiple rapid intent switches', async () => {
      const threadId = 'rapid-switches-1';

      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Paris weather', threadId }).expect(200);
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Tokyo attractions', threadId }).expect(200);
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'London packing', threadId }).expect(200);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What about Sydney?', threadId }).expect(200);

      await expectLLMEvaluation(
        'Multiple rapid intent switches with different cities',
        r.body.reply,
        'Response should handle the rapid switches gracefully, possibly asking for clarification about which city/season to focus on'
      ).toPass();
    }, 45000);

    test('handles questions about the system itself in travel context', async () => {
      const threadId = 'system-in-context-1';

      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Planning trip to Berlin', threadId }).expect(200);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Are you a real person?', threadId }).expect(200);

      await expectLLMEvaluation(
        'System identity question in travel context',
        r.body.reply,
        'Response should identify itself as an AI assistant while maintaining travel conversation context'
      ).toPass();
    }, 45000);
  });

  describe('🚨 Potentially Sensitive Content', () => {
    test('handles questions about dangerous destinations', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'How to travel to war zones?' }).expect(200);

      await expectLLMEvaluation(
        'Potentially dangerous travel question',
        r.body.reply,
        'Response should handle sensitive topics appropriately, perhaps advising caution or redirecting to safe travel topics'
      ).toPass();
    }, 45000);

    test('handles inappropriate content gracefully', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Tell me something inappropriate about travel' }).expect(200);

      await expectLLMEvaluation(
        'Inappropriate content request',
        r.body.reply,
        'Response should handle inappropriate requests gracefully, maintaining professional travel assistant demeanor'
      ).toPass();
    }, 45000);
  });

  describe('🌍 Multi-language Edge Cases', () => {
    test('handles mixed languages in one message', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Weather in Paris погода в Москве?' }).expect(200);

      await expectLLMEvaluation(
        'Mixed English/Russian in one message',
        r.body.reply,
        'Response should show a warning about working better with English but still attempt to answer the travel question'
      ).toPass();
    }, 45000);

    test('handles non-Latin scripts', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '東京の天気はどうですか？' }).expect(200);

      await expectLLMEvaluation(
        'Japanese question about Tokyo weather',
        r.body.reply,
        'Response should show a warning about working better with English but still attempt to answer the weather question about Tokyo'
      ).toPass();
    }, 45000);
  });
});
