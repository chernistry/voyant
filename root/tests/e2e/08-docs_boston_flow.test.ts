import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.NODE_ENV = 'test';

describe('E2E: Docs Flow – NYC → Boston, kid-friendly, weather follow-up', () => {
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

  test('Full flow mirrors docs scenario and keeps Boston context', async () => {
    const threadId = 'docs-boston-flow-1';

    // Step 1: Intro/help request
    const s1 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Hey - can you actually help plan a short family trip?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Assistant asks for city and dates',
      s1.body.reply,
      'Response should ask for the destination city and travel dates or month'
    ).toPass();

    // Step 2: Constraints from NYC, late June, kid + seniors, budget
    const s2 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'From NYC, end of June (last week), 4-5 days. 2 adults + toddler in stroller. Parents mid - 60s; dad dislikes long flights. Budget under $2.5k total. Ideas?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Destinations from NYC in late June with short travel and budget',
      s2.body.reply,
      'Response should recommend 2-4 nearby destinations from NYC suitable for late June, referencing short flights/drivable options and budget consciousness'
    ).toPass();

    // Step 3: Kid-friendly and minimize walking refinement
    const s3 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Make it kid‑friendly and minimize walking.',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Kid-friendly refinement retains prior constraints',
      s3.body.reply,
      'Response should refine the prior destination suggestions with toddler/stroller and low-walking considerations'
    ).toPass();

    // Step 4: Switch to a concrete destination: Boston, attractions for toddler
    const s4 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: "Let's say Boston - what should we do with a 3 year old?",
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Boston toddler-friendly attractions',
      s4.body.reply,
      'Response should mention Boston explicitly and list stroller/toddler-friendly attractions or activities with minimal walking; it should not talk about NYC'
    ).toPass();

    // Step 5: Weather follow-up; should answer for Boston, not NYC
    const s5 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: "How's the weather that week?",
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Weather answer uses Boston context',
      s5.body.reply,
      'Response should provide weather for Boston for the referenced period or current week; it should not switch city context back to NYC'
    ).toPass();
  }, 180000);
});
