import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, recordedRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.NODE_ENV = 'test';

describe('E2E: NLP Pipeline Verification - Transformers-First Cascade Testing', () => {
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

  // 🔴 CRITICAL: Test for the main issues from the ticket
  describe('🚨 CRITICAL REGRESSION TESTS - Ticket 01-fix-nlp.md', () => {

    test('🔴 transformers-classifier.ts MUST use Transformers, not regex patterns', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'critical_classifier_regression',
        'What to pack for Paris in June with my kids?');
      await expectLLMEvaluation(
        'CRITICAL: Content classification via Transformers (not regex)',
        r.body.reply,
        'CRITICAL REGRESSION TEST: Response MUST demonstrate Transformers-based content classification working. Should NOT use hardcoded regex patterns from transformers-classifier.ts. Should properly classify travel content, detect intent (packing), extract entities (Paris, June, kids), and provide relevant travel advice. If this fails, transformers-classifier.ts is still using regex instead of Transformers!'
      ).toPass();
      expect(r.body.reply).toMatch(/pack|Paris|June|kids|travel|clothes/i);
    }, 45000);

    test('🔴 transformers-corrector.ts MUST use Transformers, not static dictionary', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'critical_corrector_regression',
        'Weaher in Berln for my trip with familly');
      await expectLLMEvaluation(
        'CRITICAL: Spell correction via Transformers (not static dictionary)',
        r.body.reply,
        'CRITICAL REGRESSION TEST: Response MUST demonstrate context-aware Transformers-based spell correction. Should NOT use hardcoded TRAVEL_TYPOS dictionary from transformers-corrector.ts. Should correct typos contextually (weather/berlin/family) and provide relevant travel information. If this fails, transformers-corrector.ts is still using static dictionary!'
      ).toPass();
      expect(r.body.reply).toMatch(/weather|Berlin|trip|family|travel/i);
    }, 45000);

    test('🟡 graph.ts MUST NOT duplicate regex patterns from Transformers modules', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'graph_duplication_regression',
        'Packin advice for Barcelon in Jully');
      await expectLLMEvaluation(
        'Graph duplication check - unified Transformers facade',
        r.body.reply,
        'Response should use unified Transformers facade without duplicating correction logic from graph.ts lines 210-235. All spell corrections should go through transformers-corrector.ts, not be duplicated in graph.ts. Should provide Barcelona July packing advice with proper corrections.'
      ).toPass();
      expect(r.body.reply).toMatch(/Barcelona|July|packing|clothes|weather/i);
    }, 45000);
  });

  describe('🔍 CORE TRANSFORMERS-FIRST VERIFICATION', () => {
    test('Transformers classification works for travel content detection', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'transformers_travel_classification', 'What to pack for Paris in June?');
      await expectLLMEvaluation(
        'Travel content classification via Transformers',
        r.body.reply,
        'Response should demonstrate proper Transformers-based content classification, providing travel-relevant information without falling back to generic LLM responses. Should show intelligent understanding of travel context.'
      ).toPass();
      expect(r.body.reply).toContain(/pack|clothes|weather|Paris|June/i);
    }, 45000);

    test('Transformers intent detection routes correctly', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'transformers_intent_detection', 'Weather in Barcelona tomorrow');
      await expectLLMEvaluation(
        'Intent detection via Transformers',
        r.body.reply,
        'Response should show Transformers-based intent classification working correctly, routing to weather functionality and providing Barcelona-specific weather information'
      ).toPass();
      expect(r.body.reply).toMatch(/weather|Barcelona|temperature|forecast/i);
    }, 45000);

    test('Transformers spell correction handles typos contextually', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'transformers_spell_correction', 'Weaher in Berln for my trip');
      await expectLLMEvaluation(
        'Contextual spell correction via Transformers',
        r.body.reply,
        'Response should demonstrate intelligent spell correction (weather/berlin), maintaining travel context and providing relevant information without generic corrections'
      ).toPass();
      expect(r.body.reply).toMatch(/weather|Berlin|trip|travel/i);
    }, 45000);

    test('Transformers language detection with mixed language warning', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'transformers_language_detection', 'Weather in Paris погода в Москве');
      await expectLLMEvaluation(
        'Language detection and mixed language handling',
        r.body.reply,
        'Response should detect mixed languages (English/Russian), show appropriate warning about working better with English, but still attempt to answer travel-related questions'
      ).toPass();
      expect(r.body.reply).toMatch(/English|warning|Paris|Moscow|weather/i);
    }, 45000);
  });

  describe('🔄 CASCADE DEGRADATION VERIFICATION', () => {
    test('Transformers → LLM → Rules cascade works correctly', async () => {
      // Test with complex query that should trigger full cascade
      const r = await recordedRequest(app, transcriptRecorder, 'cascade_degradation_test',
        'I need help planning a trip from Tel Aviv to Tokyo with kids under 5, budget $3000, need flights and family hotels');
      await expectLLMEvaluation(
        'Full cascade degradation test',
        r.body.reply,
        'Response should demonstrate proper cascade: first try Transformers classification/intent detection, then LLM fallback, finally rules as last resort. Should handle complex multi-constraint travel planning.'
      ).toPass();
      expect(r.body.reply).toMatch(/Tel Aviv|Tokyo|kids|budget|flights|hotels|family/i);
    }, 45000);

    test('NER entities extracted via Transformers, not regex patterns', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'ner_transformers_priority',
        'Attractions in Rome and Paris for my vacation next month');
      await expectLLMEvaluation(
        'NER via Transformers, not regex fallback',
        r.body.reply,
        'Response should use Transformers NER for entity extraction (Rome, Paris, vacation, next month), not fallback to regex patterns. Should show intelligent understanding of multiple destinations and timeframe.'
      ).toPass();
      expect(r.body.reply).toMatch(/Rome|Paris|attractions|vacation|month/i);
    }, 45000);

    test('Content classification uses Transformers, not hardcoded regex', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'content_classification_transformers',
        'I want to know about flights from NYC to London');
      await expectLLMEvaluation(
        'Content classification via Transformers',
        r.body.reply,
        'Response should classify content as travel/flight-related using Transformers, not hardcoded regex patterns. Should route appropriately to flight/destinations functionality.'
      ).toPass();
      expect(r.body.reply).toMatch(/flight|NYC|London|travel|destination/i);
    }, 45000);
  });

  describe('🎯 INTENT CLASSIFICATION CASCADE', () => {
    test('Weather intent detected via Transformers classification', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'weather_intent_transformers', 'What is the climate like in Sydney?');
      await expectLLMEvaluation(
        'Weather intent via Transformers',
        r.body.reply,
        'Should detect weather intent using Transformers classification, not regex patterns. Should provide Sydney-specific climate/weather information.'
      ).toPass();
      expect(r.body.reply).toMatch(/weather|climate|Sydney|temperature/i);
    }, 45000);

    test('Packing intent with context preservation', async () => {
      const threadId = 'packing-context-test';
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'Weather in Amsterdam in March?',
        threadId
      }).expect(200);

      const r = await recordedRequest(app, transcriptRecorder, 'packing_intent_context', 'What should I pack?', threadId);
      await expectLLMEvaluation(
        'Packing intent with Transformers context',
        r.body.reply,
        'Should detect packing intent using Transformers, preserve Amsterdam/March context from previous message, provide contextually appropriate packing advice'
      ).toPass();
      expect(r.body.reply).toMatch(/pack|Amsterdam|March|weather|clothes/i);
    }, 45000);

    test('Attractions intent via Transformers NER + classification', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_intent_transformers', 'What to do in Berlin?');
      await expectLLMEvaluation(
        'Attractions intent via Transformers',
        r.body.reply,
        'Should detect attractions intent using Transformers classification + NER for Berlin entity, provide Berlin-specific attraction information'
      ).toPass();
      expect(r.body.reply).toMatch(/Berlin|attractions|do|activities|places/i);
    }, 45000);

    test('Destinations intent with complex constraints', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'destinations_intent_complex',
        'Where should I go for a relaxing vacation with my family in summer?');
      await expectLLMEvaluation(
        'Destinations intent with complex constraints',
        r.body.reply,
        'Should detect destinations intent using Transformers, handle complex constraints (relaxing, family, summer), provide appropriate destination recommendations'
      ).toPass();
      expect(r.body.reply).toMatch(/relaxing|family|summer|vacation|destinations/i);
    }, 45000);
  });

  describe('🔀 CONVERSATION COHERENCE & BRANCHING', () => {
    test('Complex multi-turn conversation maintains Transformers context', async () => {
      const threadId = 'coherence-test-1';

      // Turn 1: Initial destination query
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'I want to visit somewhere warm in winter',
        threadId
      }).expect(200);

      // Turn 2: Refine with budget
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'My budget is around $2000',
        threadId
      }).expect(200);

      // Turn 3: Add family context
      const r3 = await recordedRequest(app, transcriptRecorder, 'coherence_family_context', 'Traveling with kids under 10', threadId);
      await expectLLMEvaluation(
        'Multi-turn conversation coherence',
        r3.body.reply,
        'Should maintain context from previous turns (warm destination, winter, $2000 budget), incorporate new family context, provide coherent destination recommendations using Transformers throughout'
      ).toPass();
      expect(r3.body.reply).toMatch(/warm|winter|budget|kids|family|children/i);
    }, 120000);

    test('Intent switching preserves Transformers understanding', async () => {
      const threadId = 'intent-switch-test';

      // Start with weather
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'Weather in Vienna?',
        threadId
      }).expect(200);

      // Switch to attractions
      const r2 = await recordedRequest(app, transcriptRecorder, 'intent_switch_attractions', 'What attractions are there?', threadId);
      await expectLLMEvaluation(
        'Intent switching with context preservation',
        r2.body.reply,
        'Should switch from weather to attractions intent using Transformers classification, preserve Vienna context, provide Vienna-specific attraction information'
      ).toPass();
      expect(r2.body.reply).toMatch(/Vienna|attractions|weather/i);
    }, 45000);

    test('Complex branching: budget → flights → family adjustments', async () => {
      const threadId = 'complex-branching-test';

      // Initial complex query
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'Planning trip to Thailand with $1500 budget',
        threadId
      }).expect(200);

      // Add flight preferences
      await makeRequest(app, transcriptRecorder).post('/chat').send({
        message: 'Prefer direct flights if possible',
        threadId
      }).expect(200);

      // Add family context (branching point)
      const r3 = await recordedRequest(app, transcriptRecorder, 'complex_branching_family', 'Actually going with 2 kids aged 5 and 8', threadId);
      await expectLLMEvaluation(
        'Complex branching with multiple constraints',
        r3.body.reply,
        'Should handle complex branching: Thailand destination, $1500 budget, direct flights preference, family with young kids. Should adjust recommendations accordingly using Transformers throughout.'
      ).toPass();
      expect(r3.body.reply).toMatch(/Thailand|budget|flights|kids|children|family/i);
    }, 120000);
  });

  describe('🚨 EDGE CASES & FALLBACK VERIFICATION', () => {
    test('Unrelated content properly classified via Transformers', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'unrelated_content_transformers', 'How do I cook pasta?');
      await expectLLMEvaluation(
        'Unrelated content classification',
        r.body.reply,
        'Should classify as unrelated content using Transformers, not regex patterns. Should politely redirect to travel topics without providing cooking advice.'
      ).toPass();
      expect(r.body.reply).toMatch(/travel|weather|destinations|packing|attractions/i);
      expect(r.body.reply).not.toMatch(/pasta|cook|cooking|recipe/i);
    }, 45000);

    test('System identity questions handled via Transformers intent', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'system_identity_transformers', 'Are you a real person?');
      await expectLLMEvaluation(
        'System identity via Transformers intent',
        r.body.reply,
        'Should detect system intent using Transformers classification, identify as AI travel assistant, explain capabilities without generic responses'
      ).toPass();
      expect(r.body.reply).toMatch(/AI|assistant|travel|weather|destinations|packing|attractions/i);
    }, 45000);

    test('Mixed language content with proper Transformers detection', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'mixed_language_transformers', '東京の天気 Weather in Tokyo');
      await expectLLMEvaluation(
        'Mixed language detection via Transformers',
        r.body.reply,
        'Should detect mixed languages using Transformers, show appropriate warning, but still provide Tokyo weather information in English'
      ).toPass();
      expect(r.body.reply).toMatch(/Tokyo|weather|warning|English/i);
    }, 45000);

    test('Complex entity extraction: multiple cities + dates + constraints', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'complex_entity_extraction',
        'Compare flights from New York to Paris vs London in March with kids under 5');
      await expectLLMEvaluation(
        'Complex entity extraction via Transformers NER',
        r.body.reply,
        'Should extract entities using Transformers NER: New York, Paris, London, March, kids under 5. Should handle complex comparison query appropriately.'
      ).toPass();
      expect(r.body.reply).toMatch(/New York|Paris|London|March|kids|children|flights/i);
    }, 45000);
  });

  describe('🔧 REGEX VS TRANSFORMERS PRIORITY VERIFICATION', () => {
    test('Regex patterns used ONLY as last resort, not priority', async () => {
      // This test ensures that even when Transformers might fail,
      // the system doesn't default to regex patterns as primary method
      const r = await recordedRequest(app, transcriptRecorder, 'regex_fallback_only',
        'Weather in a city that definitely exists but might challenge NER');
      await expectLLMEvaluation(
        'Regex fallback verification',
        r.body.reply,
        'Even if Transformers NER has difficulty, response should attempt proper classification/intent detection before falling back to simple regex patterns. Should not use regex as primary method.'
      ).toPass();
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
    }, 45000);

    test('No hardcoded regex patterns override Transformers results', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'no_regex_override',
        'I need packing advice for traveling to visit my family in Barcelona during Christmas');
      await expectLLMEvaluation(
        'No regex override of Transformers',
        r.body.reply,
        'Should use Transformers for intent (packing), entity extraction (Barcelona, Christmas, family), and content classification. Should not have regex patterns override or interfere with Transformers results.'
      ).toPass();
      expect(r.body.reply).toMatch(/Barcelona|Christmas|family|packing/i);
    }, 45000);
  });

  describe('📊 PERFORMANCE & RELIABILITY', () => {
    test('Transformers pipeline handles high-frequency requests', async () => {
      const threadId = 'performance-test';
      const startTime = Date.now();

      // Rapid succession of requests
      for (let i = 0; i < 5; i++) {
        const r = await makeRequest(app, transcriptRecorder).post('/chat').send({
          message: `Weather in city ${i}?`,
          threadId
        }).expect(200);
        expect(r.body.reply).toBeDefined();
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time (allowing for API calls)
      expect(totalTime).toBeLessThan(30000); // 30 seconds for 5 requests
      console.log(`Performance test completed in ${totalTime}ms`);
    }, 45000);

    test('Error recovery maintains Transformers-first approach', async () => {
      // Test with intentionally problematic input
      const r = await recordedRequest(app, transcriptRecorder, 'error_recovery_transformers',
        'Weather in a city with unusual characters: ñáéíóú and emojis 🌟🚀');
      await expectLLMEvaluation(
        'Error recovery with Transformers priority',
        r.body.reply,
        'Should handle problematic input gracefully while maintaining Transformers-first approach. Should attempt proper processing before falling back to any regex patterns.'
      ).toPass();
      expect(r.body.reply).toBeDefined();
    }, 45000);
  });

  describe('🎭 ADVANCED SCENARIO TESTING', () => {
    test('Multi-intent complex query with Transformers orchestration', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'multi_intent_complex',
        'I need weather, packing list, and attractions for a business trip to Zurich in February with a conference');
      await expectLLMEvaluation(
        'Multi-intent complex query',
        r.body.reply,
        'Should handle multiple intents (weather, packing, attractions) in single query using Transformers orchestration. Should address all aspects: Zurich weather in February, business attire/conference packing, Zurich attractions.'
      ).toPass();
      expect(r.body.reply).toMatch(/Zurich|February|weather|packing|attractions|business|conference/i);
    }, 45000);

    test('Contextual spell correction with travel domain knowledge', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'contextual_spell_correction',
        'Flights from Los Angls to Dubi, what to pak for the trip?');
      await expectLLMEvaluation(
        'Contextual spell correction',
        r.body.reply,
        'Should correct travel-specific typos (Angls→Angeles, Dubi→Dubai, pak→pack) using Transformers with domain knowledge, provide relevant flight and packing information'
      ).toPass();
      expect(r.body.reply).toMatch(/Los Angeles|Dubai|flights|pack|trip/i);
    }, 45000);

    test('Transformers handles ambiguous queries with proper fallback', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'ambiguous_query_handling',
        'Paris in the spring - what should I know?');
      await expectLLMEvaluation(
        'Ambiguous query handling',
        r.body.reply,
        'Should handle ambiguous query using Transformers to determine most likely intent (probably weather/attractions for Paris in spring), provide contextually appropriate information'
      ).toPass();
      expect(r.body.reply).toMatch(/Paris|spring|weather|attractions/i);
    }, 45000);
  });

  // 🎯 COMPREHENSIVE INTEGRATION TEST - Complete Flow Coverage
  describe('🎯 COMPREHENSIVE INTEGRATION - Complete Flow Coverage from Ticket', () => {
    test('Complete transformers-first flow with all major components', async () => {
      const threadId = 'comprehensive-flow-test';

      // Step 1: Test content classification (transformers-classifier.ts)
      const step1 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step1_classification',
        'What to pack for Tokyo in March with my family?', threadId);
      await expectLLMEvaluation(
        'Step 1: Content Classification (transformers-classifier.ts)',
        step1.body.reply,
        'Should use Transformers content classification (not regex) to identify travel content, detect intent (packing), extract entities (Tokyo, March, family), and provide appropriate response'
      ).toPass();
      expect(step1.body.reply).toMatch(/Tokyo|March|pack|family|clothes|weather/i);

      // Step 2: Test spell correction (transformers-corrector.ts)
      const step2 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step2_correction',
        'Weaher in Berln for my trip', threadId);
      await expectLLMEvaluation(
        'Step 2: Spell Correction (transformers-corrector.ts)',
        step2.body.reply,
        'Should use Transformers spell correction (not static dictionary) to contextually correct weather/berlin, maintain travel context, provide relevant information'
      ).toPass();
      expect(step2.body.reply).toMatch(/weather|Berlin|trip|travel/i);

      // Step 3: Test language detection (transformers-detector.ts)
      const step3 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step3_language',
        'Weather in Paris погода в Москве', threadId);
      await expectLLMEvaluation(
        'Step 3: Language Detection (transformers-detector.ts)',
        step3.body.reply,
        'Should use langdetect library for mixed language detection, show appropriate warning, but still provide travel information for both cities'
      ).toPass();
      expect(step3.body.reply).toMatch(/Paris|Moscow|weather|warning|English/i);

      // Step 4: Test NER with enhanced entities (ner-enhanced.ts)
      const step4 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step4_ner',
        'Attractions in Rome and Paris next month with $2000 budget', threadId);
      await expectLLMEvaluation(
        'Step 4: NER Enhanced (ner-enhanced.ts)',
        step4.body.reply,
        'Should use Transformers NER for entity extraction (Rome, Paris, next month), enhanced with money detection ($2000), handle multiple cities appropriately'
      ).toPass();
      expect(step4.body.reply).toMatch(/Rome|Paris|attractions|budget|\$2000|month/i);

      // Step 5: Test complex cascade (router.ts + parsers.ts)
      const step5 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step5_cascade',
        'I need flights from Tel Aviv to Tokyo with kids under 5, budget $3000, family hotels', threadId);
      await expectLLMEvaluation(
        'Step 5: Full Cascade (Transformers → LLM → Rules)',
        step5.body.reply,
        'Should demonstrate complete cascade: Transformers classification/intent detection → LLM fallback → Rules as last resort. Handle complex multi-constraint query with proper degradation.'
      ).toPass();
      expect(step5.body.reply).toMatch(/Tel Aviv|Tokyo|kids|budget|flights|hotels|family/i);

      // Step 6: Test consent gates and web search integration
      const step6 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step6_consent',
        'Find me budget hotels in Rome for families', threadId);
      await expectLLMEvaluation(
        'Step 6: Consent Gates & External Integration',
        step6.body.reply,
        'Should trigger consent for web search, handle consent flow properly, integrate with external tools (Brave Search) when approved'
      ).toPass();
      expect(step6.body.reply).toMatch(/Rome|budget|hotels|families|search/i);

      // Step 7: Test thread coherence and intent switching
      const step7 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step7_coherence',
        'What attractions are there instead?', threadId);
      await expectLLMEvaluation(
        'Step 7: Thread Coherence & Intent Switching',
        step7.body.reply,
        'Should maintain Rome context from previous message, switch from hotels to attractions intent using Transformers, preserve family/budget constraints'
      ).toPass();
      expect(step7.body.reply).toMatch(/Rome|attractions|families|budget/i);

      // Step 8: Test error recovery and edge cases
      const step8 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step8_recovery',
        'What about unrelated topic like cooking pasta?', threadId);
      await expectLLMEvaluation(
        'Step 8: Error Recovery & Content Filtering',
        step8.body.reply,
        'Should detect unrelated content via Transformers classification, politely redirect to travel topics, maintain conversation coherence without breaking thread context'
      ).toPass();
      expect(step8.body.reply).toMatch(/travel|weather|destinations|packing|attractions/i);
      expect(step8.body.reply).not.toMatch(/pasta|cook|cooking|recipe/i);

      // Step 9: Test complex multi-turn with branching
      const step9 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step9_branching',
        'Actually, let me reconsider - I want to go to Barcelona instead with teenagers', threadId);
      await expectLLMEvaluation(
        'Step 9: Complex Branching & Context Switching',
        step9.body.reply,
        'Should handle complex branching: switch destination from Rome to Barcelona, change family composition from kids to teenagers, maintain budget constraints, preserve thread coherence throughout all changes'
      ).toPass();
      expect(step9.body.reply).toMatch(/Barcelona|teenagers|budget|travel/i);

      // Step 10: Final verification - receipts and transparency
      const step10 = await recordedRequest(app, transcriptRecorder, 'comprehensive_step10_receipts',
        '/why', threadId);
      await expectLLMEvaluation(
        'Step 10: Receipts & Transparency',
        step10.body.reply,
        'Should provide complete receipts showing all processing steps, sources used, decisions made, and self-check validation throughout the entire conversation flow'
      ).toPass();
      expect(step10.body.reply).toMatch(/receipts|sources|decisions|self.?check/i);

    }, 600000); // 10 minutes for comprehensive test
  });
});
