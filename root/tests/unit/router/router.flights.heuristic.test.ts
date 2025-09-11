import { routeIntent } from '../../../src/core/router.js';
import { isDirectFlightHeuristic } from '../../../src/core/router.optimizers.js';

describe('Router Flight Heuristics', () => {
  it('should detect direct flight queries without LLM', () => {
    const result = isDirectFlightHeuristic('flights from SVO to TLV 12/10 one way');
    expect(result.isDirect).toBe(true);
    expect(result.reason).toBe('od+date');
  });

  it('should detect IATA pair with date', () => {
    const result = isDirectFlightHeuristic('JFK to LAX tomorrow');
    expect(result.isDirect).toBe(true);
    expect(result.reason).toBe('od+date');
  });

  it('should reject queries without date', () => {
    const result = isDirectFlightHeuristic('flights from New York to Los Angeles');
    expect(result.isDirect).toBe(false);
    expect(result.reason).toBe('missing_od_or_date');
  });

  it('should route direct flight queries to flights intent', async () => {
    const result = await routeIntent({
      message: 'book flights from Moscow to Tel Aviv on December 10th',
      logger: { log: { debug: () => {} } as any }
    });
    
    expect(result.intent).toBe('flights');
    expect(result.confidence).toBe(0.9);
    expect(result.needExternal).toBe(true);
  });
});
