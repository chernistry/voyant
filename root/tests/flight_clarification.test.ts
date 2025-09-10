import { routeIntent } from '../src/core/router.js';
import { updateThreadSlots, getThreadSlots } from '../src/core/slot_memory.js';

describe('Flight Query Complexity and Clarification', () => {
  beforeEach(() => {
    // Clear any existing slots
    jest.clearAllMocks();
  });

  test('should route direct flight query to flights intent', async () => {
    const result = await routeIntent({
      message: 'flights from moscow to tel aviv in october',
      threadId: 'test-thread-1'
    });

    expect(result.intent).toBe('flights');
    expect(result.needExternal).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test('should route complex travel query to web search', async () => {
    const result = await routeIntent({
      message: 'From NYC, end of June (last week), 4-5 days. 2 adults + toddler in stroller. Parents mid - 60s; dad dislikes long flights. Budget under $2.5k total. Ideas?',
      threadId: 'test-thread-2'
    });

    expect(result.intent).toBe('web_search');
    expect(result.needExternal).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test('should ask for clarification on ambiguous flight query', async () => {
    const result = await routeIntent({
      message: 'I need help with flights',
      threadId: 'test-thread-3'
    });

    // Should route to system for clarification
    expect(result.intent).toBe('system');
    expect(result.slots.flight_clarification_needed).toBe('true');
    expect(result.slots.clarification_options).toBe('direct_search_or_web_research');
  });

  test('should handle direct search clarification response', async () => {
    const threadId = 'test-thread-4';
    
    // Set up clarification state
    updateThreadSlots(threadId, {
      awaiting_flight_clarification: 'true',
      pending_flight_query: 'flights to paris',
      clarification_options: 'direct_search_or_web_research'
    }, []);

    const result = await routeIntent({
      message: 'direct search',
      threadId
    });

    expect(result.intent).toBe('flights');
    expect(result.needExternal).toBe(true);
    
    // Check that clarification state is cleared
    const slots = getThreadSlots(threadId);
    expect(slots.awaiting_flight_clarification).toBeUndefined();
  });

  test('should handle travel research clarification response', async () => {
    const threadId = 'test-thread-5';
    
    // Set up clarification state
    updateThreadSlots(threadId, {
      awaiting_flight_clarification: 'true',
      pending_flight_query: 'trip to europe with family',
      clarification_options: 'direct_search_or_web_research'
    }, []);

    const result = await routeIntent({
      message: 'travel research',
      threadId
    });

    expect(result.intent).toBe('web_search');
    expect(result.needExternal).toBe(true);
    expect(result.slots.search_query).toBe('trip to europe with family');
    
    // Check that clarification state is cleared
    const slots = getThreadSlots(threadId);
    expect(slots.awaiting_flight_clarification).toBeUndefined();
  });
});
