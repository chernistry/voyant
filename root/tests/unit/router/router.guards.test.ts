import { routeIntent } from '../../../src/core/router.js';

describe('Router Guards', () => {
  it('should route system queries without LLM', async () => {
    const result = await routeIntent({
      message: 'help me understand what you can do',
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('system');
    expect(result.confidence).toBe(0.9);
    expect(result.needExternal).toBe(false);
  });

  it('should route policy queries without LLM', async () => {
    const result = await routeIntent({
      message: 'what are the visa requirements for France?',
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('policy');
    expect(result.confidence).toBe(0.9);
    expect(result.needExternal).toBe(true);
  });

  it('should route explicit search without LLM', async () => {
    const result = await routeIntent({
      message: 'search for best restaurants in Tokyo',
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('web_search');
    expect(result.confidence).toBe(0.9);
    expect(result.needExternal).toBe(true);
    expect(result.slots.search_query).toBeDefined();
  });
});
