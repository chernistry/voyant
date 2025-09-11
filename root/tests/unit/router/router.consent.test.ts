import { routeIntent } from '../../../src/core/router.js';
import { updateThreadSlots, getThreadSlots } from '../../../src/core/slot_memory.js';

describe('Router Consent State Clearing', () => {
  const testThreadId = 'test-consent-clearing';
  
  beforeEach(() => {
    // Set up contaminated consent state
    updateThreadSlots(testThreadId, {
      awaiting_deep_research_consent: 'true',
      pending_deep_research_query: 'complex travel planning query',
      city: 'Barcelona'
    }, []);
  });

  it('should clear consent state for policy queries', async () => {
    // Verify contaminated state exists
    const beforeSlots = getThreadSlots(testThreadId);
    expect(beforeSlots.awaiting_deep_research_consent).toBe('true');
    
    // Route policy query
    const result = await routeIntent({
      message: 'do US passport holders need a visa for Canada?',
      threadId: testThreadId,
      logger: { log: { debug: () => {} } as any }
    });
    
    // Verify policy intent
    expect(result.intent).toBe('policy');
    expect(result.confidence).toBe(0.9);
    
    // Verify consent state is cleared
    const afterSlots = getThreadSlots(testThreadId);
    expect(afterSlots.awaiting_deep_research_consent).toBe('');
    expect(afterSlots.pending_deep_research_query).toBe('');
  });

  it('should clear consent state for system queries', async () => {
    const result = await routeIntent({
      message: 'what can you help me with?',
      threadId: testThreadId,
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('system');
    
    const afterSlots = getThreadSlots(testThreadId);
    expect(afterSlots.awaiting_deep_research_consent).toBe('');
  });

  it('should clear consent state for explicit search queries', async () => {
    const result = await routeIntent({
      message: 'search for best hotels in Paris',
      threadId: testThreadId,
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('web_search');
    
    const afterSlots = getThreadSlots(testThreadId);
    expect(afterSlots.awaiting_deep_research_consent).toBe('');
  });

  it('should not trigger consent handling for guard-handled queries', async () => {
    // This test verifies that policy queries don't get processed as consent responses
    const result = await routeIntent({
      message: 'visa requirements for Japan',
      threadId: testThreadId,
      logger: { log: { debug: () => {} } as any }
    });
    
    // Should be policy, not destinations from previous query
    expect(result.intent).toBe('policy');
    expect(result.needExternal).toBe(true);
  });
});
