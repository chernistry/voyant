import { extractSlots } from '../../src/core/parsers.js';
import { optimizeSearchQuery } from '../../src/core/llm.js';

describe('Location Context Retention', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.NER_MODE = 'local';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.NER_MODE;
  });

  it('should extract Barcelona from context change message', async () => {
    const message = "Actually, I'd like to know about restaurants and nightlife in Barcelona within my budget";
    const slots = await extractSlots(message);
    
    expect(slots.city).toBe('Barcelona');
  }, 10000);

  it('should prioritize new location in search query optimization', async () => {
    const query = "restaurants and nightlife within budget";
    const context = { city: 'Barcelona', budget: '$4500' };
    const intent = 'attractions';
    
    const optimized = await optimizeSearchQuery(query, context, intent);
    
    expect(optimized.toLowerCase()).toContain('barcelona');
    expect(optimized.toLowerCase()).toContain('restaurants');
  }, 10000);

  it('should handle location context changes correctly', async () => {
    // Second message changing to Barcelona (focus on the key functionality)
    const secondMessage = "Actually, I'd like to know about Barcelona restaurants";
    const secondSlots = await extractSlots(secondMessage);
    
    expect(secondSlots.city).toBe('Barcelona');
  }, 10000);

  it('should optimize queries with current location context', async () => {
    const contexts = [
      { city: 'Barcelona', intent: 'attractions' },
      { city: 'Paris', intent: 'attractions' },
      { city: 'Tokyo', intent: 'attractions' }
    ];
    
    for (const { city, intent } of contexts) {
      const optimized = await optimizeSearchQuery(
        'restaurants and nightlife', 
        { city }, 
        intent
      );
      
      expect(optimized.toLowerCase()).toContain(city.toLowerCase());
    }
  }, 15000);
});
