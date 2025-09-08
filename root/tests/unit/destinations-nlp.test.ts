import { extractTravelPreferences } from '../../src/core/preference-extractor.js';
import { recommendDestinations } from '../../src/tools/destinations.js';

describe('AI-Powered Destinations Filtering', () => {
  describe('AI Cascade: NLP→LLM→Fallback', () => {
    it('should use NLP for clear travel preferences', async () => {
      const result = await extractTravelPreferences('family trip with kids');
      
      expect(result.aiMethod).toBe('nlp');
      expect(result.travelStyle).toBe('family');
      expect(result.groupType).toBe('family');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should use LLM when NLP fails but text is travel-related', async () => {
      const result = await extractTravelPreferences('romantic honeymoon getaway');
      
      expect(['nlp', 'llm']).toContain(result.aiMethod);
      expect(result.travelStyle).toBe('romantic');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should show AI failure for unclear input', async () => {
      const result = await extractTravelPreferences('programming code javascript');
      
      expect(result.aiMethod).toBe('failed');
      expect(result.budgetLevel).toBe('mid');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should extract luxury preferences via AI', async () => {
      const result = await extractTravelPreferences('luxury 5-star resort vacation');
      
      expect(['nlp', 'llm']).toContain(result.aiMethod);
      expect(result.travelStyle).toBe('luxury');
      expect(result.budgetLevel).toBe('high');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should extract entities when using NLP', async () => {
      const result = await extractTravelPreferences('traveling with toddlers to Paris');
      
      if (result.aiMethod === 'nlp') {
        expect(result.entities).toBeDefined();
      }
      expect(result.confidence).toBeGreaterThan(0.2);
    });

    it('should handle cultural preferences via AI', async () => {
      const result = await extractTravelPreferences('love visiting museums and art galleries');
      
      expect(['nlp', 'llm']).toContain(result.aiMethod);
      expect(result.activityType).toBe('museums');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    it('should handle complex preferences with AI understanding', async () => {
      const result = await extractTravelPreferences(
        'romantic anniversary trip for couple, love museums and cultural sites'
      );
      
      expect(['nlp', 'llm']).toContain(result.aiMethod);
      expect(result.travelStyle).toBe('romantic');
      expect(result.groupType).toBe('couple');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should extract budget preferences correctly', async () => {
      const result = await extractTravelPreferences('budget backpacking adventure');
      
      expect(['nlp', 'llm']).toContain(result.aiMethod);
      expect(result.budgetLevel).toBe('low');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe('AI-Enhanced Destination Recommendations', () => {
    it('should prioritize family destinations when AI detects family travel', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'family vacation with young children',
        month: 'Jun'
      });
      
      expect(result).toHaveLength(4);
      const cities = result.map(r => r.value.city);
      expect(cities.some(city => 
        ['Amsterdam', 'Barcelona', 'Vienna', 'Copenhagen'].includes(city)
      )).toBe(true);
    });

    it('should handle romantic preferences with AI understanding', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'romantic honeymoon for couple',
        month: 'May'
      });
      
      expect(result).toHaveLength(4);
      const cities = result.map(r => r.value.city);
      expect(cities.some(city => 
        ['Paris', 'Florence', 'Vienna', 'Prague'].includes(city)
      )).toBe(true);
    });

    it('should handle budget preferences via AI', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'budget backpacking trip',
        month: 'Jul'
      });
      
      expect(result).toHaveLength(4);
      result.forEach(dest => {
        expect(['low', 'mid'].includes(dest.value.tags.budget)).toBe(true);
      });
    });

    it('should handle cultural preferences with AI semantic understanding', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'love museums and cultural heritage sites',
        month: 'Sep'
      });
      
      expect(result).toHaveLength(4);
      const cities = result.map(r => r.value.city);
      expect(cities.some(city => 
        ['Paris', 'Rome', 'Florence', 'Vienna', 'Berlin'].includes(city)
      )).toBe(true);
    });

    it('should gracefully handle AI failure', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'xyz random text',
        month: 'Aug'
      });
      
      expect(result).toHaveLength(4);
      expect(result.every(r => r.source.includes('Catalog'))).toBe(true);
    });

    it('should maintain month filtering with AI enhancement', async () => {
      const result = await recommendDestinations({
        travelerProfile: 'romantic getaway',
        month: 'Dec'
      });
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(4);
      result.forEach(dest => {
        expect(dest.value.tags.months.includes('Dec')).toBe(true);
      });
    });
  });
});
