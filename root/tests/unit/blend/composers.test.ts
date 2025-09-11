import { composeWeatherReply, composePackingReply, composeAttractionsReply } from '../../../src/core/composers.js';

describe('Deterministic Composers', () => {
  describe('composeWeatherReply', () => {
    it('should compose weather reply with city and date', () => {
      const result = composeWeatherReply('Tokyo', 'March', 'High 18°C / Low 8°C, partly cloudy', 'Open-Meteo');
      expect(result).toBe('Weather for Tokyo — March: High 18°C / Low 8°C, partly cloudy (Open-Meteo)');
    });

    it('should compose weather reply with only city', () => {
      const result = composeWeatherReply('Paris', undefined, 'High 15°C / Low 5°C, rainy');
      expect(result).toBe('Weather for Paris: High 15°C / Low 5°C, rainy (Open-Meteo)');
    });

    it('should compose weather reply without context', () => {
      const result = composeWeatherReply(undefined, undefined, 'High 20°C / Low 10°C, sunny');
      expect(result).toBe('Weather: High 20°C / Low 10°C, sunny (Open-Meteo)');
    });
  });

  describe('composePackingReply', () => {
    it('should compose packing reply with all details', () => {
      const result = composePackingReply('London', 'December', 'High 8°C / Low 2°C, cold', ['warm coat', 'gloves', 'scarf'], 'Open-Meteo');
      expect(result).toBe('London in December: Weather: High 8°C / Low 2°C, cold (Open-Meteo)\nPack: warm coat, gloves, scarf');
    });

    it('should compose packing reply without items', () => {
      const result = composePackingReply('Miami', 'July', 'High 32°C / Low 26°C, hot and humid', [], 'Open-Meteo');
      expect(result).toBe('Miami in July: Weather: High 32°C / Low 26°C, hot and humid (Open-Meteo)');
    });

    it('should compose packing reply without weather', () => {
      const result = composePackingReply('Berlin', 'Spring', undefined, ['light jacket', 'umbrella']);
      expect(result).toBe('Berlin in Spring: \nPack: light jacket, umbrella');
    });
  });

  describe('composeAttractionsReply', () => {
    it('should compose attractions reply with multiple items', () => {
      const attractions = ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral'];
      const result = composeAttractionsReply('Paris', attractions, 'OpenTripMap');
      expect(result).toBe('• Eiffel Tower\n• Louvre Museum\n• Notre-Dame Cathedral (OpenTripMap)');
    });

    it('should compose attractions reply with single item', () => {
      const attractions = ['Tokyo Tower'];
      const result = composeAttractionsReply('Tokyo', attractions);
      expect(result).toBe('• Tokyo Tower (OpenTripMap)');
    });

    it('should handle empty attractions list', () => {
      const result = composeAttractionsReply('Unknown City', []);
      expect(result).toBe(' (OpenTripMap)');
    });
  });
});
