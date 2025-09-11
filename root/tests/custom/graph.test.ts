import { runGraphTurn } from '../../src/core/graph.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';

const mockLogger = { log: { warn: jest.fn(), debug: jest.fn() } as any };

describe('Agent Graph', () => {
  test('destinations intent with city and month', async () => {
    const result = await runGraphTurn('Where should I go in Tokyo in June?', 'test-thread', mockLogger);
    expect(result).toHaveProperty('done', true);
    expect(result).toHaveProperty('reply');
    
    await expectLLMEvaluation(
      'Destinations query for Tokyo in June',
      (result as any).reply,
      'Response should provide destination recommendations for Tokyo in June, considering weather and activities'
    ).toPass();
  }, 10000);

  test('packing intent with city and month', async () => {
    const result = await runGraphTurn('What to pack for Tokyo in March?', 'test-thread', mockLogger);
    expect(result).toHaveProperty('done', true);
    expect(result).toHaveProperty('reply');
    
    await expectLLMEvaluation(
      'Packing query for Tokyo in March',
      (result as any).reply,
      'Response should provide packing suggestions for Tokyo in March, considering weather conditions'
    ).toPass();
  }, 10000);

  test('attractions intent with city', async () => {
    const result = await runGraphTurn('What to do in Barcelona?', 'test-thread', mockLogger);
    expect(result).toHaveProperty('done', true);
    expect(result).toHaveProperty('reply');
    
    await expectLLMEvaluation(
      'Attractions query for Barcelona',
      (result as any).reply,
      'Response should provide information about attractions and activities in Barcelona'
    ).toPass();
  }, 10000);

  test('unknown intent returns clarification', async () => {
    const result = await runGraphTurn('Hello there', 'test-thread', mockLogger);
    expect(result).toHaveProperty('done', true);
    expect(result).toHaveProperty('reply');
    
    await expectLLMEvaluation(
      'Unclear/greeting message',
      (result as any).reply,
      'Response should ask for clarification about travel needs or provide helpful guidance'
    ).toPass();
  }, 10000);

  test('follow-up context handling', async () => {
    const threadId = 'test-context-thread';
    
    // First query
    const result1 = await runGraphTurn('Weather in Paris?', threadId, mockLogger);
    expect(result1).toHaveProperty('done', true);
    
    // Follow-up query should remember context
    const result2 = await runGraphTurn('What about packing?', threadId, mockLogger);
    expect(result2).toHaveProperty('done', true);
    expect(result2).toHaveProperty('reply');
    
    await expectLLMEvaluation(
      'Context-aware packing query after weather query for Paris',
      (result2 as any).reply,
      'Response should provide packing suggestions for Paris, showing it remembered the city from previous context'
    ).toPass();
  }, 15000);
});
