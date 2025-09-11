import { describe, it, expect } from '@jest/globals';
import { routeIntent } from '../../src/core/router.js';

describe('Policy Routing', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.NER_MODE = 'local';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.NER_MODE;
  });

  it('should route Delta policy questions to policy intent', async () => {
    const message =
      "What is the timeframe for Delta's risk-free cancellation policy " +
      'and what are the key conditions?';
    const result = await routeIntent({ message });
    
    expect(result.intent).toBe('policy');
    expect(result.needExternal).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  }, 15000);

  it('should route United baggage questions to policy intent', async () => {
    const message = "What is United baggage allowance?";
    const result = await routeIntent({ message });
    
    expect(result.intent).toBe('policy');
    expect(result.needExternal).toBe(true);
  }, 15000);

  it('should route Marriott cancellation questions to policy intent', async () => {
    const message = "Marriott cancellation policy";
    const result = await routeIntent({ message });
    
    expect(result.intent).toBe('policy');
    expect(result.needExternal).toBe(true);
  }, 15000);
});
