import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, recordedRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

describe('E2E: Intent Switching, Family Refinements & Threads', () => {
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

  describe('🔄 Intent Switching', () => {
    test('switch from weather to packing', async () => {
      const threadId = 'test-switch-1';
      const r1 = await recordedRequest(app, transcriptRecorder, 'intent_switch_weather_to_packing_step1', 'Weather in Paris in June?', threadId);
      const r2 = await recordedRequest(app, transcriptRecorder, 'intent_switch_weather_to_packing_step2', 'What should I pack?', threadId);

      expect(r2.body.threadId).toBe(threadId);
      await expectLLMEvaluation(
        'Switch from weather to packing',
        r2.body.reply,
        'Response should reuse city/month context from weather to packing'
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
      await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Where to go in June from NYC?' }).expect(200);
      const b = await makeRequest(app, transcriptRecorder).post('/chat').send({ message: 'Make it kid-friendly' }).expect(200);
      await expectLLMEvaluation(
        'New thread without prior context',
        b.body.reply,
        'Response should request missing city or month/budget instead of assuming NYC or June'
      ).toPass();
    }, 45000);
  });
});

