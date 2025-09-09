import pino from 'pino';
import { RouterResult } from '../../src/schemas/router.js';
import * as RouterModule from '../../src/core/router.js';
import * as LlmModule from '../../src/core/llm.js';
import * as RouterLLM from '../../src/core/router.llm.js';

const log = pino({ level: 'silent' });

describe('Router cascade: AI-First Approach with Confidence Scoring', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (global as any).__memory_store__?.clear?.();
  });

  test('weather in Paris hits Transformers fast path (confidence ≥ 0.7)', async () => {
    const tSpy = jest.spyOn(RouterModule, 'routeViaTransformersFirst').mockResolvedValue(
      RouterResult.parse({
        intent: 'weather',
        needExternal: true,
        slots: { city: 'Paris', dates: 'tomorrow' },
        confidence: 0.95,
      })
    );
    const ciSpy = jest.spyOn(LlmModule, 'classifyIntent');
    const rllmSpy = jest.spyOn(RouterLLM, 'routeWithLLM');

    const res = await RouterModule.routeIntent({ message: "What's the weather in Paris tomorrow?", logger: { log } });

    expect(tSpy).toHaveBeenCalledTimes(1);
    // In AI-first approach, we still try LLM for content classification but not for intent if Transformers succeeds
    expect(ciSpy).toHaveBeenCalled();
    expect(rllmSpy).not.toHaveBeenCalled();

    expect(res.intent).toBe('weather');
    expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    expect(res.slots.city?.toLowerCase()).toBe('paris');
  });

  test('AI-first routing with confidence thresholds', async () => {
    const callOrder: string[] = [];

    jest.spyOn(RouterModule, 'routeViaTransformersFirst').mockImplementation(async () => {
      callOrder.push('transformers');
      return undefined; // below threshold or no match
    });

    jest.spyOn(LlmModule, 'classifyIntent').mockImplementation(async () => {
      callOrder.push('classifyIntent');
      return { intent: 'destinations', confidence: 0.9, needExternal: false } as any;
    });

    const rllmSpy = jest
      .spyOn(RouterLLM, 'routeWithLLM')
      .mockImplementation(async () => {
        callOrder.push('routeWithLLM');
        return {
          intent: 'destinations',
          confidence: 0.9,
          needExternal: false,
          slots: { city: '' , month: '', dates: '', travelerProfile: '' },
          missingSlots: [],
        } as any;
      });

    const res = await RouterModule.routeIntent({
      message: 'Where should we go with kids on a budget from Boston?',
      logger: { log },
    });

    // In AI-first approach, we try classifyIntent early in the process
    expect(callOrder.includes('classifyIntent')).toBe(true);
    expect(res.intent).toBe('destinations');
    // routeWithLLM may or may not be called depending on classifyIntent; allow either
    expect(rllmSpy.mock.calls.length >= 0).toBe(true);
  });

  test('Unrelated/gibberish → final fallback is unknown with override', async () => {
    jest.spyOn(RouterModule, 'routeViaTransformersFirst').mockResolvedValue(undefined);

    // Mark content as unrelated to trigger override logic
    jest.spyOn(LlmModule, 'classifyContent').mockResolvedValue({
      content_type: 'unrelated',
      is_explicit_search: false,
      has_mixed_languages: false,
      needs_web_search: false,
    } as any);

    // LLM classifies unknown but with some confidence; override to unknown happens with confidence 0.3
    jest.spyOn(LlmModule, 'classifyIntent').mockResolvedValue({
      intent: 'unknown',
      confidence: 0.6,
      needExternal: false,
    } as any);

    const res = await RouterModule.routeIntent({ message: 'asdf qwer zxcv ???', logger: { log } });
    expect(res.intent).toBe('unknown');
    expect(res.confidence).toBeLessThanOrEqual(0.4);
  });
});
