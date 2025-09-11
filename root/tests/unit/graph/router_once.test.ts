/**
 * Test: Router called exactly once per turn
 */

import { jest } from '@jest/globals';

// Mock the routeIntent function to count calls
const mockRouteIntent = jest.fn();
jest.unstable_mockModule('../../../src/core/llm.js', () => ({
  routeIntent: mockRouteIntent
}));

describe('Router Once Pattern', () => {
  beforeEach(() => {
    mockRouteIntent.mockClear();
    mockRouteIntent.mockResolvedValue({
      intent: 'weather',
      confidence: 0.9,
      slots: { city: 'Barcelona' }
    });
  });

  test('should call routeIntent exactly once per turn', async () => {
    const { runGraphTurn } = await import('../../../src/core/graph.js');
    
    const result = await runGraphTurn(
      'weather in Barcelona today',
      'test-thread',
      { log: { debug: jest.fn(), warn: jest.fn() } as any }
    );

    // Router should be called exactly once
    expect(mockRouteIntent).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(true);
  });

  test('should not call routeIntent twice for weather queries', async () => {
    const { runGraphTurn } = await import('../../../src/core/graph.js');
    
    await runGraphTurn(
      'what is the weather in Barcelona today?',
      'test-thread-2',
      { log: { debug: jest.fn(), warn: jest.fn() } as any }
    );

    // Should still be exactly one call
    expect(mockRouteIntent).toHaveBeenCalledTimes(1);
  });
});
