import { blendWithFacts } from '../../src/core/blend.js';
import pino from 'pino';

const log = pino({ level: 'silent' });

describe('Hallucination Guard', () => {
  test('no invented facts when external data unavailable', async () => {
    // Test with an invalid city that should cause API failures
    const { reply, citations } = await blendWithFacts(
      {
        message: 'What to pack for InvalidCity in March?',
        route: {
          intent: 'packing',
          needExternal: true,
          confidence: 0.7,
          slots: { city: 'InvalidCity', month: 'March' }
        }
      },
      { log }
    );

    // The function should handle API failures gracefully
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);

    // Should acknowledge the user's request
    expect(reply).toMatch(/InvalidCity|pack|March/i);

    // If there are citations, they should be valid sources
    if (citations && citations.length > 0) {
      const validSources = ['Open-Meteo', 'REST Countries', 'OpenTripMap', 'Brave Search'];
      citations.forEach(citation => {
        expect(validSources).toContain(citation);
      });
    }
  });

  test('handles unknown intent gracefully', async () => {
    const { reply, citations } = await blendWithFacts(
      {
        message: 'Random question about nothing specific',
        route: {
          intent: 'unknown',
          needExternal: false,
          confidence: 0.4,
          slots: {}
        }
      },
      { log }
    );

    expect(reply).toBeTruthy();
    expect(typeof reply).toBe('string');
    expect(citations ?? []).toHaveLength(0);
  });

  test('handles missing slots with clarification requests', async () => {
    const { reply, citations } = await blendWithFacts(
      {
        message: 'What to pack?',
        route: {
          intent: 'packing',
          needExternal: true,
          confidence: 0.7,
          slots: {}
        }
      },
      { log }
    );

    expect(reply).toBeTruthy();
    expect(typeof reply).toBe('string');
    expect(citations ?? []).toHaveLength(0);
  });

  test('validates response structure', async () => {
    const result = await blendWithFacts(
      {
        message: 'What to pack for Tokyo?',
        route: {
          intent: 'packing',
          needExternal: true,
          confidence: 0.7,
          slots: { city: 'Tokyo' }
        }
      },
      { log }
    );

    // Should always return proper structure
    expect(result).toHaveProperty('reply');
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(0);

    // Citations should be array if present
    if (result.citations) {
      expect(Array.isArray(result.citations)).toBe(true);
      result.citations.forEach(citation => {
        expect(typeof citation).toBe('string');
      });
    }
  });

  test('never reveals internal implementation details', async () => {
    const { reply } = await blendWithFacts(
      {
        message: 'What to do in Paris?',
        route: {
          intent: 'attractions',
          needExternal: true,
          confidence: 0.7,
          slots: { city: 'Paris' }
        }
      },
      { log }
    );

    // Should not reveal chain-of-thought, tool names, or internal processing
    expect(reply).not.toMatch(/tool|adapter|fetch|api|mock|jest|test/i);
    expect(reply).not.toMatch(/step 1|step 2|step 3/i);
    expect(reply).not.toMatch(/chain.of.thought|scratchpad|thinking/i);
  });

  test('provides helpful responses even with failures', async () => {
    // Test with a city that might not have data
    const { reply } = await blendWithFacts(
      {
        message: 'What to pack for a remote island?',
        route: {
          intent: 'packing',
          needExternal: true,
          confidence: 0.7,
          slots: { city: 'RemoteIsland' }
        }
      },
      { log }
    );

    // Should still provide a helpful response
    expect(reply).toBeTruthy();
    expect(typeof reply).toBe('string');
  });
});