import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

describe('E2E: Error Handling & External API Failures', () => {
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
      await makeRequest(app, transcriptRecorder).post('/chat').set('Content-Type', 'application/json').send('invalid json').expect(400);
    });

    test('handles empty messages', async () => {
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: '' }).expect(400);
    });

    test('handles very long threadIds', async () => {
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Hello', threadId: 'a'.repeat(65) }).expect(400);
    });
  });

  describe('🔧 External API Failure Scenarios', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    test('weather API timeout fallback', async () => {
      nock('https://api.open-meteo.com').get(/.*/).delay(5000).reply(200, {});
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to pack for Tokyo in March?' }).expect(200);
      await expectLLMEvaluation(
        'Packing query with weather API timeout',
        r.body.reply,
        'Response should provide helpful packing advice for Tokyo in March, either with or without specific weather data'
      ).toPass();
      expect(String(r.body.reply).toLowerCase()).toMatch(/pack|bring|clothes|jacket/i);
    }, 45000);

    test('attractions API error handling', async () => {
      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What attractions are in London?' }).expect(200);
      await expectLLMEvaluation(
        'Attractions query with potential API errors',
        r.body.reply,
        'Response should handle any API errors gracefully, either providing attractions from working APIs or asking for clarification, with appropriate citations'
      ).toPass();
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
    }, 45000);

    test('country API empty response', async () => {
      nock('https://restcountries.com').get(/.*/).reply(200, {});
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
      nock('https://geocoding-api.open-meteo.com').get(/.*/).reply(503);
      nock('https://api.opentripmap.com').get(/.*/).reply(503);
      nock('https://api.search.brave.com').get(/.*/).reply(503);

      const r = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'What to do in Tokyo in March?' }).expect(200);
      await expectLLMEvaluation(
        'Query with all APIs failing',
        r.body.reply,
        'Response should handle multiple API failures gracefully, providing helpful general advice without fabricated data'
      ).toPass();
    }, 45000);
  });
});

