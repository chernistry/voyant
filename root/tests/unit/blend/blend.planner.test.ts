import { planBlend, type BlendPlan } from '../../../src/core/blend.planner.js';
import * as prompts from '../../../src/core/prompts.js';
import * as llm from '../../../src/core/llm.js';

jest.mock('../../../src/core/prompts.js');
jest.mock('../../../src/core/llm.js');

describe('Blend Planner', () => {
  const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (prompts.getPrompt as jest.Mock).mockResolvedValue('mock prompt template');
  });

  it('should return structured plan for explicit search query', async () => {
    const mockPlan: BlendPlan = {
      explicit_search: true,
      unrelated: false,
      system_question: false,
      mixed_languages: false,
      query_facets: { wants_restaurants: false, wants_budget: false, wants_flights: false },
      needs_web: true,
      needs_weather: false,
      needs_attractions: false,
      needs_country_facts: false,
      style: 'bullet',
      summarize_web_with_llm: false,
      missing_slots: [],
      safety: { disallowed_topic: false, reason: '' }
    };

    (llm.callLLM as jest.Mock).mockResolvedValue(JSON.stringify(mockPlan));

    const result = await planBlend('search for restaurants in Paris', { intent: 'unknown', slots: {} }, mockLog);

    expect(result.explicit_search).toBe(true);
    expect(result.needs_web).toBe(true);
    expect(result.style).toBe('bullet');
    expect(llm.callLLM).toHaveBeenCalledWith(
      'mock prompt template',
      { responseFormat: 'json', log: mockLog }
    );
  });

  it('should return structured plan for weather query', async () => {
    const mockPlan: BlendPlan = {
      explicit_search: false,
      unrelated: false,
      system_question: false,
      mixed_languages: false,
      query_facets: { wants_restaurants: false, wants_budget: false, wants_flights: false },
      needs_web: false,
      needs_weather: true,
      needs_attractions: false,
      needs_country_facts: false,
      style: 'short',
      summarize_web_with_llm: false,
      missing_slots: [],
      safety: { disallowed_topic: false, reason: '' }
    };

    (llm.callLLM as jest.Mock).mockResolvedValue(JSON.stringify(mockPlan));

    const result = await planBlend('weather in Tokyo', { intent: 'weather', slots: { city: 'Tokyo' } }, mockLog);

    expect(result.needs_weather).toBe(true);
    expect(result.explicit_search).toBe(false);
    expect(result.style).toBe('short');
  });

  it('should identify unrelated queries', async () => {
    const mockPlan: BlendPlan = {
      explicit_search: false,
      unrelated: true,
      system_question: false,
      mixed_languages: false,
      query_facets: { wants_restaurants: false, wants_budget: false, wants_flights: false },
      needs_web: false,
      needs_weather: false,
      needs_attractions: false,
      needs_country_facts: false,
      style: 'short',
      summarize_web_with_llm: false,
      missing_slots: [],
      safety: { disallowed_topic: false, reason: '' }
    };

    (llm.callLLM as jest.Mock).mockResolvedValue(JSON.stringify(mockPlan));

    const result = await planBlend('how to cook pasta', { intent: 'unknown', slots: {} }, mockLog);

    expect(result.unrelated).toBe(true);
  });

  it('should identify missing slots', async () => {
    const mockPlan: BlendPlan = {
      explicit_search: false,
      unrelated: false,
      system_question: false,
      mixed_languages: false,
      query_facets: { wants_restaurants: false, wants_budget: false, wants_flights: false },
      needs_web: false,
      needs_weather: true,
      needs_attractions: false,
      needs_country_facts: false,
      style: 'short',
      summarize_web_with_llm: false,
      missing_slots: ['city'],
      safety: { disallowed_topic: false, reason: '' }
    };

    (llm.callLLM as jest.Mock).mockResolvedValue(JSON.stringify(mockPlan));

    const result = await planBlend('what is the weather', { intent: 'weather', slots: {} }, mockLog);

    expect(result.missing_slots).toContain('city');
    expect(result.needs_weather).toBe(true);
  });
});
