/**
 * Tests for optimized graph implementation
 * Validates G-E-R-A pattern and performance improvements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runGraphTurn } from '../../../src/core/graph.js';
import pinoLib from 'pino';

// Mock dependencies
vi.mock('../../../src/core/router.js', () => ({
  routeIntent: vi.fn().mockResolvedValue({
    intent: 'weather',
    confidence: 0.8,
    slots: { city: 'Paris' }
  })
}));

vi.mock('../../../src/core/transformers-classifier.js', () => ({
  classifyContent: vi.fn().mockResolvedValue({
    content_type: 'travel',
    confidence: 0.9
  })
}));

vi.mock('../../../src/core/ner-enhanced.js', () => ({
  extractEntitiesEnhanced: vi.fn().mockResolvedValue({
    locations: [{ text: 'Paris', score: 0.95 }],
    dates: [],
    durations: [],
    money: []
  })
}));

vi.mock('../../../src/core/blend.js', () => ({
  blendWithFacts: vi.fn().mockResolvedValue({
    reply: 'Weather in Paris is sunny today.',
    citations: ['Weather API']
  })
}));

vi.mock('../../../src/core/slot_memory.js', () => ({
  getThreadSlots: vi.fn().mockReturnValue({}),
  updateThreadSlots: vi.fn(),
  setLastIntent: vi.fn(),
  getLastIntent: vi.fn(),
  normalizeSlots: vi.fn((prior, extracted) => ({ ...prior, ...extracted })),
  readConsentState: vi.fn().mockReturnValue({ awaiting: false, type: '', pending: '' }),
  writeConsentState: vi.fn()
}));

vi.mock('../../../src/core/graph.optimizers.js', () => ({
  checkYesNoShortcut: vi.fn().mockReturnValue(null),
  checkPolicyHit: vi.fn().mockReturnValue(false),
  checkWebishHit: vi.fn().mockReturnValue(false),
  buildTurnCache: vi.fn().mockResolvedValue({
    msgRaw: 'Paris weather today',
    msgL: 'paris weather today',
    words: new Set(['paris', 'weather', 'today'])
  }),
  maybeFastWeather: vi.fn().mockResolvedValue({
    next: 'weather',
    slots: { city: 'Paris' }
  })
}));

vi.mock('../../../src/core/clarifier.js', () => ({
  buildClarifyingQuestion: vi.fn().mockResolvedValue('Which city are you asking about?')
}));

describe('Optimized Graph', () => {
  const logger = pinoLib({ level: 'silent' });
  const ctx = { log: logger };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle fast-path weather queries', async () => {
    const result = await runGraphTurn('Paris weather today', 'test-thread', ctx);
    
    expect(result).toEqual({
      done: true,
      reply: 'Weather in Paris is sunny today.',
      citations: ['Weather API']
    });
  });

  it('should handle guard stage YES/NO shortcuts', async () => {
    const { checkYesNoShortcut, readConsentState } = await import('../../../src/core/graph.optimizers.js');
    const { getThreadSlots } = await import('../../../src/core/slot_memory.js');
    
    // Mock consent state
    vi.mocked(getThreadSlots).mockReturnValue({
      awaiting_search_consent: 'true',
      pending_search_query: 'hotels in Paris'
    });
    
    vi.mocked(readConsentState).mockReturnValue({
      awaiting: true,
      type: 'web',
      pending: 'hotels in Paris'
    });
    
    vi.mocked(checkYesNoShortcut).mockReturnValue('yes');
    
    // Mock web search
    vi.doMock('../../../src/tools/search.js', () => ({
      searchTravelInfo: vi.fn().mockResolvedValue({
        ok: true,
        results: [
          { title: 'Paris Hotels', url: 'http://example.com', description: 'Great hotels in Paris' }
        ]
      }),
      getSearchCitation: vi.fn().mockReturnValue('Web Search')
    }));
    
    const result = await runGraphTurn('yes', 'test-thread', ctx);
    
    expect(result.done).toBe(true);
    expect(result.reply).toContain('Paris');
  });

  it('should handle policy hits in guard stage', async () => {
    const { checkPolicyHit } = await import('../../../src/core/graph.optimizers.js');
    vi.mocked(checkPolicyHit).mockReturnValue(true);
    
    // Mock policy agent
    vi.doMock('../../../src/core/policy_agent.js', () => ({
      PolicyAgent: vi.fn().mockImplementation(() => ({
        answer: vi.fn().mockResolvedValue({
          answer: 'Visa requirements for France...',
          citations: [{ title: 'France Visa Policy', snippet: 'Requirements...' }]
        })
      }))
    }));
    
    const result = await runGraphTurn('visa requirements for France', 'test-thread', ctx);
    
    expect(result.done).toBe(true);
    expect(result.reply).toContain('Visa requirements');
  });

  it('should handle webish hits in guard stage', async () => {
    const { checkWebishHit } = await import('../../../src/core/graph.optimizers.js');
    vi.mocked(checkWebishHit).mockReturnValue(true);
    
    const result = await runGraphTurn('cheap flights this weekend', 'test-thread', ctx);
    
    expect(result).toEqual({
      done: true,
      reply: 'I can look this up on the web. Want me to search now?'
    });
  });

  it('should log metrics for performance tracking', async () => {
    const logSpy = vi.spyOn(logger, 'debug');
    
    await runGraphTurn('Paris weather today', 'test-thread', ctx);
    
    // Should log completion metrics
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.any(String),
        llmCallsThisTurn: expect.any(Number),
        slotsCount: expect.any(Number)
      }),
      'graph_turn_complete'
    );
  });
});
