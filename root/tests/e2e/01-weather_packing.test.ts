import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, recordedRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

describe('E2E: Weather & Packing', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder | undefined;

  beforeAll(() => {
    transcriptRecorder = createRecorderIfEnabled();
    if (transcriptRecorder) console.log('📝 Transcript saving enabled');
    else console.log('📝 Transcript saving disabled (use --save-transcripts to enable)');
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
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France' }] });

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
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'London', latitude: 51.5074, longitude: -0.1278, country: 'United Kingdom' }] });

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
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, { results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }] });

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
});

