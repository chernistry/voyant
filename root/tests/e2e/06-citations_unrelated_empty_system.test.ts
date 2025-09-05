import { describe, test, beforeAll, afterAll, beforeEach, afterEach, expect } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

describe('E2E: Citations, Unrelated, Empty Input, System/Meta', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder | undefined;

  beforeAll(() => {
    transcriptRecorder = createRecorderIfEnabled();
  });

  afterAll(async () => {
    if (transcriptRecorder) await transcriptRecorder.saveTranscripts();
  });

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('📚 Citations & Sources', () => {
    test('includes citations when external facts are used (packing/weather success)', async () => {
      nock('https://geocoding-api.open-meteo.com').get(/\/v1\/search.*/).query(true).reply(200, {
        results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France' }],
      });
      nock('https://api.open-meteo.com').get(/\/v1\/forecast.*/).query(true).reply(200, {
        daily: { temperature_2m_max: [24], temperature_2m_min: [14], precipitation_probability_mean: [20] },
      });
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Paris in March?' }).expect(200);
      expect(Array.isArray(r.body.citations) || r.body.citations === undefined).toBeTruthy();
      expect((r.body.citations || []).join(',')).toMatch(/Open-Meteo/i);
    }, 45000);

    test('includes citations for destinations when country facts and weather succeed', async () => {
      const threadId = 'citations-dest-1';
      nock.cleanAll();
      nock('https://geocoding-api.open-meteo.com').get('/v1/search').query(true).reply(200, {
        results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }],
      });
      nock('https://geocoding-api.open-meteo.com').get('/v1/search').query(true).reply(200, {
        results: [{ name: 'New York', latitude: 40.7128, longitude: -74.006, country: 'United States' }],
      });
      nock('https://api.open-meteo.com').get('/v1/forecast').query(true).reply(200, {
        daily: { temperature_2m_max: [28], temperature_2m_min: [20], precipitation_probability_mean: [10] },
      });
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

  describe('🤯 Completely Unrelated & Gibberish Queries', () => {
    test('handles completely unrelated questions gracefully', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What is the meaning of life?' }).expect(200);
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
      expect(r.body.reply.length).toBeGreaterThan(0);
      // Should redirect politely to travel topics
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
        "Response should indicate it's a travel assistant and suggest focusing on travel-related questions"
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
      expect(String(r.body.reply).toLowerCase()).toMatch(/travel/);
    }, 45000);

    test('handles emoji-only messages', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '🤔😊🚀🌟' }).expect(200);
      expect(String(r.body.reply).toLowerCase()).toMatch(/travel/);
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
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Weather in Paris?', threadId }).expect(200);
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What do you mean?', threadId }).expect(200);
      const t = String(r.body.reply).toLowerCase();
      expect(t).toMatch(/travel assistant|help with/);
    }, 45000);
  });
});
