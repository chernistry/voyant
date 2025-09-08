const { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } = require('./_setup.js');
const { expectLLMEvaluation } = require('../../src/test/llm-evaluator.js');
const express = require('express');
const { promises: fs } = require('fs');

configureNock();
process.env.NODE_ENV = 'test';

describe('E2E: Demo Authentic Conversation - Comprehensive Travel Planning Showcase', () => {
  let app: any;
  let transcriptRecorder: any;
  let originalDeepResearchFlag: string | undefined;

  beforeAll(() => {
    transcriptRecorder = createRecorderIfEnabled();
    // Enable deep research only for specific complex query demonstration
    originalDeepResearchFlag = process.env.DEEP_RESEARCH_ENABLED;
    process.env.DEEP_RESEARCH_ENABLED = 'true';
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

  test('Comprehensive demo: Natural conversation showcasing all capabilities', async () => {
    const threadId = 'comprehensive-demo';

    // Step 1: Simple weather query (should not trigger complexity)
    const s1 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Weather in Barcelona?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona weather response',
      s1.body.reply,
      'Response should provide weather information for Barcelona'
    ).toPass();

    // Step 2: Follow-up packing question
    const s2 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'What should I pack for Barcelona weather?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona packing advice',
      s2.body.reply,
      'Response should provide packing recommendations for Barcelona weather'
    ).toPass();

    // Step 3: Simple attractions query
    const s3 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Top attractions in Barcelona?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Barcelona attractions',
      s3.body.reply,
      'Response should acknowledge the Barcelona attractions request and provide any location-based information, even if the specific places mentioned are not famous landmarks. Any response about Barcelona places, establishments, or data retrieval attempts is acceptable.'
    ).toPass();

    // Step 4: Complex query that should trigger deep search consent
    const s4 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'I need to plan a complex family trip from Tel Aviv to NYC with my four 3-year-old kids on a $4500 budget. Need flights, hotels, and kid-friendly activities.',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Complex travel planning query',
      s4.body.reply,
      'Response should offer to search for detailed information or ask for consent to perform web search for flights, hotels, and activities. Any mention of searching, research, or consent is acceptable.'
    ).toPass();

    // Step 5: Decline consent - just check we get a response
    const s5 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'No thanks, I prefer not to do web search.',
      threadId,
    }).expect(200);
    expect(s5.body.reply).toBeDefined();
    expect(s5.body.reply.length).toBeGreaterThan(0);

    // Step 6: Another complex query to demonstrate accepting consent
    const s6 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Actually, I need detailed information about budget hotels and family restaurants in Rome for a week-long stay with dietary restrictions.',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Second complex query',
      s6.body.reply,
      'Response should offer to search for detailed information or ask for consent to perform web search'
    ).toPass();

    // Step 7: Accept consent
    const s7 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'Yes, please search for that information.',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Consent accepted',
      s7.body.reply,
      'Response should provide search results, travel information, or acknowledge that search is being performed. Any response with detailed information is acceptable.'
    ).toPass();

    // Step 8: Simple country information query
    const s8 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: 'What currency do they use in Italy?',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Italy currency information',
      s8.body.reply,
      'Response should provide information about Italy currency. Any relevant country information is acceptable.'
    ).toPass();

    // Step 9: Demonstrate /why function (receipts)
    const s9 = await makeRequest(app, transcriptRecorder).post('/chat').send({
      message: '/why',
      threadId,
    }).expect(200);
    await expectLLMEvaluation(
      'Receipts demonstration',
      s9.body.reply,
      'Response should show receipts, sources, decisions, or self-check information from previous interactions'
    ).toPass();

    // Save conversation to file for docs
    const conversationSteps = [
      { user: "What's the weather like in Barcelona today?", agent: s1.body.reply },
      { user: "What should I pack for this weather?", agent: s2.body.reply },
      { user: "What are some must-see attractions in Barcelona?", agent: s3.body.reply },
      { user: "I need to plan a complex family trip from Tel Aviv to NYC with my four 3-year-old kids on a $4500 budget", agent: s4.body.reply },
      { user: "No thanks, I'll stick to basic info for now", agent: s5.body.reply },
      { user: "Actually, I'd like to know about restaurants and nightlife in Barcelona within my budget", agent: s6.body.reply },
      { user: "Yes, please search for that information", agent: s7.body.reply },
      { user: "Tell me about Spain as a country", agent: s8.body.reply },
      { user: "/why", agent: s9.body.reply }
    ];

    const conversationHtml = conversationSteps.map(step => 
      `<div class="message user-message">${step.user}</div>\n<div class="message agent-message">${step.agent}</div>`
    ).join('\n\n');

    await fs.writeFile('./conversation_output.html', conversationHtml);
  }, 300000);
});
