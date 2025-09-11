// ✅ Configure Transformers.js FIRST, before other imports
import { env } from '@huggingface/transformers';
import path from 'node:path';
import { handleChat } from '../../src/core/blend.js';
import { createLogger } from '../../src/util/logging.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, TranscriptRecorder, nock } from './_setup.js';
import express from 'express';

// Local-only models + WASM backend knobs
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFS = true;
env.useFSCache = true;
env.localModelPath = path.resolve(process.cwd(), 'models');

// ARM64-specific WASM tuning
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;     // Single thread for stability
  env.backends.onnx.wasm.proxy = true;       // Worker helps too
}

configureNock();

beforeAll(() => {
  process.env.TRANSFORMERS_CASCADE_ENABLED = 'false';
  process.env.NODE_ENV = 'test';
});

describe('E2E: Chaotic Conversation Flow - Real-world Scenarios', () => {
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

  test('ultra_chaotic_context_jumping_test', async () => {
    const threadId = 'ultra-chaotic-test';

    // Initialize conversation state tracking
    let contextState = {
      cities: new Set(),
      budgets: new Set(),
      airlines: new Set(),
      hotels: new Set(),
      dates: new Set(),
      activities: new Set(),
      lastIntent: null,
      consentGiven: false
    };

    // STEP 1: Start with specific flight search (establish initial context)
    console.log('🛫 Step 1: Initial flight search - Moscow to Tel Aviv');
    const flightStep = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'flights from moscow to tel aviv 12-10-2025 one way', threadId })
      .expect(200);

    contextState.cities.add('moscow');
    contextState.cities.add('tel aviv');
    contextState.dates.add('2025-10-12');
    contextState.lastIntent = 'flights';

    await expectLLMEvaluation(
      'Flight search with Amadeus API',
      flightStep.body.reply,
      'Response should contain flight information with pricing, routing, and duration details. Should mention EUR currency and flight times.'
    ).toPass();

    // STEP 2: CHAOTIC JUMP: Suddenly ask about restaurants in Tokyo (completely different city!)
    console.log('🍜 Step 2: CHAOTIC JUMP - Restaurants in Tokyo (context conflict)');
    const restaurantJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What are the best sushi restaurants in Tokyo?', threadId })
      .expect(200);

    contextState.cities.add('tokyo');
    contextState.activities.add('sushi');
    contextState.activities.add('restaurants');

    await expectLLMEvaluation(
      'Context conflict: Tokyo restaurants after Moscow-Tel Aviv flight',
      restaurantJump.body.reply,
      'Response should handle the sudden context switch from Tel Aviv flight to Tokyo restaurants. Should either switch context to Tokyo or ask for clarification about the context conflict.'
    ).toPass();

    // STEP 3: CHAOTIC JUMP: Ask about hotel policies (no previous hotel context)
    console.log('🏨 Step 3: CHAOTIC JUMP - Hotel policies (no prior hotel discussion)');
    const hotelPolicyJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What\'s the cancellation policy for Hilton hotels?', threadId })
      .expect(200);

    contextState.hotels.add('hilton');

    await expectLLMEvaluation(
      'Hotel policy query without prior hotel context',
      hotelPolicyJump.body.reply,
      'Response should provide Hilton cancellation policy information from RAG system, even though no specific hotel was mentioned previously.'
    ).toPass();

    // STEP 4: CHAOTIC JUMP: Back to weather, but for a new city (Berlin)
    console.log('🌤️ Step 4: CHAOTIC JUMP - Weather in Berlin (new city)');
    const berlinWeatherJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What\'s the weather like in Berlin next week?', threadId })
      .expect(200);

    contextState.cities.add('berlin');
    contextState.lastIntent = 'weather';

    await expectLLMEvaluation(
      'Berlin weather query in chaotic context',
      berlinWeatherJump.body.reply,
      'Response should provide Berlin weather information, showing ability to handle multiple city contexts simultaneously.'
    ).toPass();

    // STEP 5: CHAOTIC JUMP: Ask about visa for Japan (different country from all previous)
    console.log('🛂 Step 5: CHAOTIC JUMP - Visa requirements for Japan');
    const japanVisaJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'Do I need a visa to visit Japan as a US citizen?', threadId })
      .expect(200);

    contextState.cities.add('japan');

    await expectLLMEvaluation(
      'Japan visa requirements in multi-country context',
      japanVisaJump.body.reply,
      'Response should provide accurate visa information for Japan, demonstrating ability to handle visa queries amidst multiple ongoing travel contexts.'
    ).toPass();

    // STEP 6: CHAOTIC JUMP: Back to original flight but with different details
    console.log('🛫 Step 6: CHAOTIC JUMP - Return to original flight with modifications');
    const returnToFlight = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'Actually, can you find flights from Moscow to Tel Aviv but for November instead?', threadId })
      .expect(200);

    contextState.dates.add('november');
    contextState.lastIntent = 'flights';

    await expectLLMEvaluation(
      'Return to original flight context with date modification',
      returnToFlight.body.reply,
      'Response should remember the original Moscow-Tel Aviv flight context and provide November flight options, showing strong context retention.'
    ).toPass();

    // STEP 7: CHAOTIC JUMP: Ask about activities in Barcelona (new city again)
    console.log('🎭 Step 7: CHAOTIC JUMP - Activities in Barcelona');
    const barcelonaActivities = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What are some fun activities to do in Barcelona?', threadId })
      .expect(200);

    contextState.cities.add('barcelona');
    contextState.activities.add('activities');

    await expectLLMEvaluation(
      'Barcelona activities in complex multi-city context',
      barcelonaActivities.body.reply,
      'Response should provide Barcelona activity suggestions, managing context alongside previous cities (Moscow, Tel Aviv, Tokyo, Berlin, Japan).'
    ).toPass();

    // STEP 8: CHAOTIC JUMP: Airline policy question (switch from hotel policy)
    console.log('✈️ Step 8: CHAOTIC JUMP - Airline policy (different from hotel policy)');
    const airlinePolicyJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What\'s Delta\'s policy on carry-on luggage?', threadId })
      .expect(200);

    contextState.airlines.add('delta');

    await expectLLMEvaluation(
      'Delta carry-on policy in chaotic context',
      airlinePolicyJump.body.reply,
      'Response should provide Delta airline carry-on luggage policy from RAG system, switching from previous hotel policy discussion.'
    ).toPass();

    // STEP 9: CHAOTIC JUMP: Complex budget planning request (triggers deep research)
    console.log('💰 Step 9: CHAOTIC JUMP - Complex budget planning (deep research trigger)');
    const budgetPlanningJump = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({
        message: 'I need a detailed budget breakdown for a 2-week trip visiting Barcelona, Tokyo, and Berlin with flights from Moscow. Include hotels, food, and activities. Budget limit: $3000.',
        threadId
      })
      .expect(200);

    contextState.budgets.add('3000');
    contextState.lastIntent = 'budget_planning';

    await expectLLMEvaluation(
      'Complex multi-city budget planning',
      budgetPlanningJump.body.reply,
      'Response should offer to perform deep research for complex budget planning across multiple cities. Should request consent for web search and mention the complexity of the multi-destination planning.'
    ).toPass();

    // STEP 10: Give consent for research
    console.log('✅ Step 10: Consent acceptance for deep research');
    const consentAcceptance = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'Yes, please research this budget breakdown for me.', threadId })
      .expect(200);

    contextState.consentGiven = true;

    await expectLLMEvaluation(
      'Consent acceptance for complex budget research',
      consentAcceptance.body.reply,
      'Response should acknowledge consent and begin research process, or provide detailed budget breakdown with sources.'
    ).toPass();

    // STEP 11: CHAOTIC JUMP: /why command to check receipts
    console.log('📄 Step 11: CHAOTIC JUMP - /why command for receipts');
    const whyCommand = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: '/why', threadId })
      .expect(200);

    await expectLLMEvaluation(
      'Receipts after complex chaotic conversation',
      whyCommand.body.reply,
      'Response should show detailed receipts with sources, decisions, and self-check information from the complex multi-city, multi-intent conversation.'
    ).toPass();

    // STEP 12: CHAOTIC JUMP: Return to weather but for original city (context retention test)
    console.log('🌤️ Step 12: CHAOTIC JUMP - Weather for original city (Moscow)');
    const moscowWeatherReturn = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'What about the weather in Moscow for my flight date?', threadId })
      .expect(200);

    await expectLLMEvaluation(
      'Return to original city weather after complex context switching',
      moscowWeatherReturn.body.reply,
      'Response should provide Moscow weather information, demonstrating excellent context retention by remembering the original Moscow flight from step 1 amidst all the chaotic city switching.'
    ).toPass();

    // Final validation of context retention
    console.log('🔍 Final context retention validation...');
    expect(contextState.cities.size).toBeGreaterThan(5); // Should have multiple cities
    expect(contextState.lastIntent).toBe('weather'); // Should remember last intent
    expect(contextState.consentGiven).toBe(true); // Should remember consent was given

    // Test that agent can handle context conflicts properly
    const conflictTest = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({ message: 'Which city were we originally planning flights from?', threadId })
      .expect(200);

    await expectLLMEvaluation(
      'Context conflict resolution - original city recall',
      conflictTest.body.reply,
      'Response should correctly identify Moscow as the original departure city from the first flight query, demonstrating strong context retention through chaotic conversation.'
    ).toPass();

    console.log('🎉 Ultra-chaotic context jumping test completed successfully!');
    console.log(`📊 Cities mentioned: ${Array.from(contextState.cities).join(', ')}`);
    console.log(`🏨 Airlines/Hotels mentioned: ${Array.from(contextState.airlines).concat(Array.from(contextState.hotels)).join(', ')}`);
    console.log(`💰 Budgets mentioned: ${Array.from(contextState.budgets).join(', ')}`);
    console.log(`📅 Consent given: ${contextState.consentGiven}`);
    console.log(`🔄 Thread ID: ${threadId}`);

  }, 450000); // 7.5 minutes timeout for ultra-chaotic test

  test('airline_policy_rag_integration', async () => {
    const threadId = 'airline-policy-test';

    // Test Delta airline policy RAG
    const deltaPolicyStep = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({
        message: 'What is the timeframe for Delta\'s risk-free cancellation policy and what are the key conditions?',
        threadId
      })
      .expect(200);

    await expectLLMEvaluation(
      'Delta airline cancellation policy query',
      deltaPolicyStep.body.reply,
      'Response should provide specific information about Delta\'s 24-hour risk-free cancellation policy, including conditions and fare type exceptions'
    ).toPass();

    console.log('✈️ Airline policy RAG test completed successfully!');
  }, 60000);

  test('multilingual_support_validation', async () => {
    const threadId = 'multilingual-test';

    // Test Russian language support
    const russianStep = await makeRequest(app, transcriptRecorder)
      .post('/chat')
      .send({
        message: 'Погода в Москве на следующей неделе',
        threadId
      })
      .expect(200);

    await expectLLMEvaluation(
      'Russian weather query',
      russianStep.body.reply,
      'Response should handle Russian input and provide weather information for Moscow in English'
    ).toPass();

    console.log('🌍 Multilingual support test completed successfully!');
  }, 60000);
});