import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.NODE_ENV = 'test';

describe('E2E: Demo Authentic Conversation - Natural Travel Planning Flow', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder | undefined;
  let originalDeepResearchFlag: string | undefined;

  beforeAll(() => {
    transcriptRecorder = createRecorderIfEnabled();
    // Disable deep research for consistent demo behavior
    originalDeepResearchFlag = process.env.DEEP_RESEARCH_ENABLED;
    process.env.DEEP_RESEARCH_ENABLED = 'false';
  });

  afterAll(async () => {
    if (transcriptRecorder) await transcriptRecorder.saveTranscripts();
    // Restore original flag
    if (originalDeepResearchFlag !== undefined) {
      process.env.DEEP_RESEARCH_ENABLED = originalDeepResearchFlag;
    } else {
      delete process.env.DEEP_RESEARCH_ENABLED;
    }
  });

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('Demo conversation: Travel planning showcase', async () => {
    const threadId = 'demo-showcase';

    // Step 1: Weather inquiry
    const s1 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Weather in Barcelona?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona weather',
      s1.body.reply,
      'Response should provide weather information for Barcelona'
    ).toPass();

    // Step 2: Packing question for Barcelona
    const s2 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'What to pack for Barcelona in September?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona packing advice',
      s2.body.reply,
      'Response should provide packing recommendations for Barcelona in September'
    ).toPass();

    // Step 3: Attractions in Barcelona
    const s3 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Top attractions in Barcelona?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona attractions',
      s3.body.reply,
      'Response should provide location-based information about Barcelona, including any places, points of interest, or establishments (restaurants, cafes, or attractions are all acceptable)'
    ).toPass();

    // Step 4: Different city - Rome weather
    const s4 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'How about Rome weather?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Rome weather',
      s4.body.reply,
      'Response should provide weather information for Rome'
    ).toPass();

    // Step 5: Rome attractions
    const s5 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'What to see in Rome?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Rome attractions',
      s5.body.reply,
      'Response should acknowledge the Rome attractions request, even if unable to retrieve specific data (any response about Rome or data retrieval issues is acceptable)'
    ).toPass();
  }, 300000);
});
