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
  return host.includes('127.0.0.1') || host.includes('localhost') || host.includes('openrouter.ai');
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

describe('E2E Comprehensive User Journey Tests with Transcripts', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder;

  beforeAll(() => {
    transcriptRecorder = new TranscriptRecorder();
  });

  afterAll(async () => {
    if (transcriptRecorder) {
      await transcriptRecorder.saveTranscripts();
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
    test('attractions queries', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_query', 'What to do in Tokyo?');

      await expectLLMEvaluation(
        'Attractions query for Tokyo',
        r.body.reply,
        'Response should provide information about things to do and see in Tokyo, or ask for more specific preferences'
      ).toPass();
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

      // First query: attractions with city
      const r1 = await recordedRequest(app, transcriptRecorder, 'intent_switch_attractions_to_weather_step1', 'Things to do in Barcelona?', threadId);

      // Second query: weather (should remember Barcelona)
      const r2 = await recordedRequest(app, transcriptRecorder, 'intent_switch_attractions_to_weather_step2', 'How is the weather there in summer?', threadId);

      await expectLLMEvaluation(
        'Context switching from attractions to weather for Barcelona',
        r2.body.reply,
        'Response should provide weather information for Barcelona in summer, showing it remembered the city from previous context'
      ).toPass();
    }, 45000);
  });

  describe('🌐 Multilingual Scenarios', () => {
    test('mixed language conversation', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'multilingual_russian_query', 'Погода в Москве в июне');

      await expectLLMEvaluation(
        'Russian language weather query for Moscow in June',
        r.body.reply,
        'Response should handle the Russian query appropriately, either providing weather info for Moscow in June or asking for clarification in English'
      ).toPass();
    }, 45000);

    test('Spanish attractions query', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'multilingual_spanish_query', '¿Qué hacer en Barcelona?');

      await expectLLMEvaluation(
        'Spanish attractions query for Barcelona',
        r.body.reply,
        'Response should handle Spanish query about Barcelona attractions, providing relevant information in English'
      ).toPass();
    }, 45000);
  });

  describe('❓ Clarification Discipline', () => {
    test('packing clarifier when month/dates missing', async () => {
      const r1 = await recordedRequest(app, transcriptRecorder, 'clarification_packing_no_dates_step1', 'What to pack for Tokyo?');
      
      await expectLLMEvaluation(
        'Packing clarifier for Tokyo without dates',
        r1.body.reply,
        'Response should ask a single targeted question about month or travel dates'
      ).toPass();
      
      const qMarks = (String(r1.body.reply).match(/\?/g) || []).length;
      expect(qMarks).toBeGreaterThanOrEqual(1);
      expect(qMarks).toBeLessThanOrEqual(2);

      const r2 = await recordedRequest(app, transcriptRecorder, 'clarification_packing_no_dates_step2', 'March.', r1.body.threadId);
      
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
      
      const r1 = await recordedRequest(app, transcriptRecorder, 'family_destinations_step1', 'Where should I go in June from NYC?', threadId);
      
      await expectLLMEvaluation(
        'Initial destinations from NYC in June',
        r1.body.reply,
        'Response should offer 2-4 destination options with June weather rationale'
      ).toPass();

      const r2 = await recordedRequest(app, transcriptRecorder, 'family_destinations_step2', 'Make it kid-friendly.', threadId);
      
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
      const r = await recordedRequest(app, transcriptRecorder, 'typos_tolerance', 'Wher shud I go in Jnne from NYC?');

      await expectLLMEvaluation(
        'Typos in destinations query for June from NYC',
        r.body.reply,
        'Response should robustly interpret the intent (destinations in June from NYC) despite typos'
      ).toPass();
    }, 45000);

    test('emojis and punctuationless input', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'emoji_input', 'what to pack for tokyo in march 🤔');

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
      
      await recordedRequest(app, transcriptRecorder, 'long_thread_step1', 'Where to go in June from NYC?', tid);
      
      for (let i = 0; i < 9; i++) {
        await recordedRequest(app, transcriptRecorder, `long_thread_step${i+2}`, 'shorten flight time please', tid);
      }
      
      const final = await recordedRequest(app, transcriptRecorder, 'long_thread_final', 'Make it kid-friendly', tid);
      
      await expectLLMEvaluation(
        'After many turns, still honors kid-friendly refinement',
        final.body.reply,
        'Response should reflect family/kid-friendly adjustments without losing prior June/NYC context'
      ).toPass();
    }, 45000);

    test('new thread does not inherit old context', async () => {
      const a = await recordedRequest(app, transcriptRecorder, 'new_thread_isolation_step1', 'Where to go in June from NYC?');
      const b = await recordedRequest(app, transcriptRecorder, 'new_thread_isolation_step2', 'Make it kid-friendly');
      
      await expectLLMEvaluation(
        'New thread without prior context',
        b.body.reply,
        'Response should request missing city or month/budget instead of assuming NYC or June'
      ).toPass();
    }, 45000);
  });

  describe('🛡️ CoT Safety', () => {
    test('no chain-of-thought leakage', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'cot_safety', 'Packing list for Tokyo in March? Explain briefly.');
      
      const leakMarkers = [/chain[-\s]?of[-\s]?thought/i, /\breasoning:/i, /step\s*\d+/i];
      leakMarkers.forEach((re) => expect(re.test(String(r.body.reply))).toBeFalsy());
    }, 15000);
  });

  describe('🚨 Error Handling & Edge Cases', () => {
    test('handles non-existent cities gracefully', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'nonexistent_city', 'Weather in Nonexistentville?');

      await expectLLMEvaluation(
        'Non-existent city query',
        r.body.reply,
        'Response should gracefully handle the non-existent city, asking for a valid city name or providing helpful guidance'
      ).toPass();
    }, 45000);

    test('handles very long messages', async () => {
      const longMessage = 'I am planning a trip to Paris and I want to know ' + 'what to pack '.repeat(20) + 'for my journey in June with my family.';

      const r = await recordedRequest(app, transcriptRecorder, 'very_long_message', longMessage);

      await expectLLMEvaluation(
        'Very long message about Paris trip planning',
        r.body.reply,
        'Response should handle the long message appropriately, extracting key information (Paris, June, family) and providing relevant travel advice'
      ).toPass();
    }, 45000);

    test('handles malformed JSON gracefully', async () => {
      await request(app)
        .post('/chat')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    test('handles empty messages', async () => {
      await request(app)
        .post('/chat')
        .send({ message: '' })
        .expect(400);
    });

    test('handles very long threadIds', async () => {
      await request(app)
        .post('/chat')
        .send({ message: 'Hello', threadId: 'a'.repeat(65) })
        .expect(400);
    });
  });

  describe('🤯 Completely Unrelated & Gibberish Queries', () => {
    test('handles completely unrelated questions gracefully', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'unrelated_question', 'What is the meaning of life?');

      console.log('DEBUG: Response for unrelated question:', r.body.reply);

      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
      expect(r.body.reply.length).toBeGreaterThan(0);

      expect(String(r.body.reply).toLowerCase()).not.toMatch(/city|month|date/i);
      expect(String(r.body.reply).toLowerCase()).toMatch(/travel assistant|travel planning|weather|destinations|packing|attractions/i);
    }, 45000);

    test('handles pure gibberish input', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'gibberish_input', 'asdkfjhaskjdfhlkasjdhfkljashdf');

      await expectLLMEvaluation(
        'Complete gibberish input',
        r.body.reply,
        'Response should ask for clarification about travel plans or politely indicate it cannot understand the input'
      ).toPass();
    }, 45000);

    test('handles programming/code questions', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'programming_question', 'How do I write a React component?');

      await expectLLMEvaluation(
        'Programming question unrelated to travel',
        r.body.reply,
        'Response should indicate it\'s a travel assistant and suggest focusing on travel-related questions'
      ).toPass();
    }, 45000);

    test('handles medical/health questions', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'medical_question', 'What medicine should I take for a headache?');

      await expectLLMEvaluation(
        'Medical question unrelated to travel',
        r.body.reply,
        'Response should politely decline to give medical advice and focus on travel topics'
      ).toPass();
    }, 45000);
  });

  describe('🚫 Empty & Edge Input Messages', () => {
    test('handles whitespace-only messages', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'whitespace_only', '   \n\t   ');

      await expectLLMEvaluation(
        'Whitespace-only message',
        r.body.reply,
        'Response should ask for actual travel-related content or indicate it needs more information'
      ).toPass();
    }, 45000);

    test('handles emoji-only messages', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'emoji_only', '🤔😊🚀🌟');

      await expectLLMEvaluation(
        'Emoji-only message',
        r.body.reply,
        'Response should ask for clarification about travel plans or politely indicate it cannot interpret emoji-only messages'
      ).toPass();
    }, 45000);

    test('handles extremely long city names', async () => {
      const longCityName = 'VeryLongCityNameThatDoesNotExistAndShouldBeHandledGracefullyInTheSystem';
      const r = await recordedRequest(app, transcriptRecorder, 'extremely_long_city', `Weather in ${longCityName}?`);

      await expectLLMEvaluation(
        'Extremely long city name',
        r.body.reply,
        'Response should handle the long city name gracefully, either correcting it or asking for clarification'
      ).toPass();
    }, 45000);
  });

  describe('❓ System & Meta Questions', () => {
    test('handles "who are you" questions', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'identity_question', 'Who are you?');

      await expectLLMEvaluation(
        'Identity question',
        r.body.reply,
        'Response should identify itself as a travel assistant and explain its capabilities'
      ).toPass();
    }, 45000);

    test('handles "what can you do" questions', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'capabilities_question', 'What can you help me with?');

      await expectLLMEvaluation(
        'Capabilities question',
        r.body.reply,
        'Response should explain travel-related capabilities (weather, packing, destinations, attractions) and ask about travel plans'
      ).toPass();
    }, 45000);
  });

  describe('🌍 Multi-language Edge Cases', () => {
    test('handles mixed languages in one message', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'mixed_languages', 'Weather in Paris погода в Москве?');

      await expectLLMEvaluation(
        'Mixed English/Russian in one message',
        r.body.reply,
        'Response should show a warning about working better with English but still attempt to answer the travel question'
      ).toPass();
    }, 45000);

    test('handles non-Latin scripts', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'japanese_script', '東京の天気はどうですか？');

      await expectLLMEvaluation(
        'Japanese question about Tokyo weather',
        r.body.reply,
        'Response should show a warning about working better with English but still attempt to answer the weather question about Tokyo'
      ).toPass();
    }, 45000);
  });
});
