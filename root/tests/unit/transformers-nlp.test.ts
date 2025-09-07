import { describe, it, expect, beforeEach } from '@jest/globals';
import { classifyContent, classifyIntent } from '../../src/core/transformers-classifier.js';
import { correctSpelling } from '../../src/core/transformers-corrector.js';
import { detectLanguage } from '../../src/core/transformers-detector.js';
import { extractEntitiesEnhanced } from '../../src/core/ner-enhanced.js';
import { TransformersNLP } from '../../src/core/transformers-nlp-facade.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Transformers NLP Components', () => {
  describe('Content Classification', () => {
    it('should classify system questions correctly', async () => {
      const result = await classifyContent('are you real?', logger);
      expect(result.content_type).toBe('system');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should classify budget queries correctly', async () => {
      const result = await classifyContent('how much does it cost to travel to Paris?', logger);
      expect(result.content_type).toBe('budget');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify unrelated topics correctly', async () => {
      const result = await classifyContent('how to cook pasta?', logger);
      expect(result.content_type).toBe('unrelated');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify travel content with intent', async () => {
      const result = await classifyContent('what is the weather like in Tokyo?', logger);
      expect(result.content_type).toBe('travel');
      expect(result.intent).toBe('weather');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Intent Classification', () => {
    it('should classify weather intents correctly', async () => {
      const testCases = [
        'what is the weather in Berlin?',
        'how hot is it in Madrid?',
        'will it rain tomorrow in Paris?'
      ];

      for (const text of testCases) {
        const result = await classifyIntent(text, logger);
        expect(result.intent).toBe('weather');
        expect(result.confidence).toBeGreaterThan(0.9);
      }
    });

    it('should classify packing intents correctly', async () => {
      const testCases = [
        'what should I pack for Japan?',
        'what clothes to bring to Iceland?',
        'packing list for summer vacation'
      ];

      for (const text of testCases) {
        const result = await classifyIntent(text, logger);
        expect(result.intent).toBe('packing');
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should classify attractions intents correctly', async () => {
      const testCases = [
        'what to do in Rome?',
        'best attractions in London',
        'museums in Paris'
      ];

      for (const text of testCases) {
        const result = await classifyIntent(text, logger);
        expect(result.intent).toBe('attractions');
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should classify destinations intents correctly', async () => {
      const testCases = [
        'where should I go for vacation?',
        'tell me about Spain as a country',
        'best destinations in Europe'
      ];

      for (const text of testCases) {
        const result = await classifyIntent(text, logger);
        expect(result.intent).toBe('destinations');
        expect(result.confidence).toBeGreaterThan(0.7);
      }
    });
  });

  describe('Spell Correction', () => {
    it('should correct common travel typos', async () => {
      const testCases = [
        { input: 'weaher in berln', expected: 'weather in berlin' },
        { input: 'packin for pars', expected: 'packing for paris' },
        { input: 'atractions in londn', expected: 'attractions in london' }
      ];

      for (const testCase of testCases) {
        const result = await correctSpelling(testCase.input, logger);
        expect(result.corrected_text).toBe(testCase.expected);
        expect(result.corrections.length).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should not modify correct text', async () => {
      const text = 'weather in Paris';
      const result = await correctSpelling(text, logger);
      expect(result.corrected_text).toBe(text);
      expect(result.corrections.length).toBe(0);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle multiple typos in one text', async () => {
      const result = await correctSpelling('weaher and packin for berln', logger);
      expect(result.corrected_text).toBe('weather and packing for berlin');
      expect(result.corrections.length).toBe(3);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Language Detection', () => {
    it('should detect English correctly', async () => {
      const result = await detectLanguage('what is the weather in Paris?', logger);
      expect(result.language).toBe('en');
      expect(result.script_type).toBe('latin');
      expect(result.has_mixed_languages).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should detect mixed languages', async () => {
      const result = await detectLanguage('weather in Москва', logger);
      expect(result.has_mixed_languages).toBe(true);
      expect(result.script_type).toBe('mixed');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect Cyrillic script', async () => {
      const result = await detectLanguage('погода в Москве', logger);
      expect(result.language).toBe('ru');
      expect(result.script_type).toBe('cyrillic');
      expect(result.has_mixed_languages).toBe(false);
    });

    it('should handle short text gracefully', async () => {
      const result = await detectLanguage('hi', logger);
      expect(result.language).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.2);
    });
  });

  describe('Enhanced Entity Extraction', () => {
    it('should extract locations correctly', async () => {
      const result = await extractEntitiesEnhanced('weather in Paris and London', logger);
      expect(result.locations.length).toBeGreaterThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should extract money entities', async () => {
      const result = await extractEntitiesEnhanced('trip costs $500 and €300', logger);
      expect(result.money.length).toBeGreaterThanOrEqual(1);
      const moneyTexts = result.money.map(m => m.text);
      expect(moneyTexts.some(text => text.includes('$500') || text.includes('€300'))).toBe(true);
    });

    it('should extract duration entities', async () => {
      const result = await extractEntitiesEnhanced('3 days trip and 2 hours flight', logger);
      expect(result.durations.length).toBeGreaterThanOrEqual(1);
      const durationTexts = result.durations.map(d => d.text);
      expect(durationTexts.some(text => text.includes('days') || text.includes('hours'))).toBe(true);
    });

    it('should handle empty input gracefully', async () => {
      const result = await extractEntitiesEnhanced('', logger);
      expect(result.entities.length).toBe(0);
      expect(result.confidence).toBeLessThan(0.6);
    });
  });

  describe('Unified NLP Facade', () => {
    let nlp: TransformersNLP;

    beforeEach(() => {
      nlp = new TransformersNLP(logger);
    });

    it('should process travel query comprehensively', async () => {
      const result = await nlp.process('weaher in berln for packin');
      
      expect(result.corrected_text).toBe('weather in berlin for packing');
      expect(result.corrections.length).toBeGreaterThan(0);
      expect(result.content_classification.content_type).toBe('travel');
      expect(['weather', 'packing']).toContain(result.intent_classification.intent);
      expect(result.language_detection.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle system questions', async () => {
      const result = await nlp.process('are you a real person?');
      
      expect(result.content_classification.content_type).toBe('system');
      expect(result.intent_classification.intent).toBe('system');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should process multilingual input', async () => {
      const result = await nlp.process('weather in Москва');
      
      expect(result.language_detection.has_mixed_languages).toBe(true);
      expect(result.language_detection.script_type).toBe('mixed');
      expect(result.content_classification.content_type).toBe('travel');
    });

    it('should maintain performance under 300ms for typical queries', async () => {
      const start = Date.now();
      await nlp.process('weather in Paris');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Regression Tests', () => {
    const goldenTestCases = [
      {
        input: 'weaher in berln',
        expected: {
          corrected: 'weather in berlin',
          intent: 'weather',
          contentType: 'travel'
        }
      },
      {
        input: 'what to pack for kids trip',
        expected: {
          intent: 'packing',
          contentType: 'travel'
        }
      },
      {
        input: 'are you real',
        expected: {
          contentType: 'system',
          intent: 'system'
        }
      }
    ];

    it('should maintain accuracy on golden test cases', async () => {
      const nlp = new TransformersNLP(logger);
      
      for (const testCase of goldenTestCases) {
        const result = await nlp.process(testCase.input);
        
        if (testCase.expected.corrected) {
          expect(result.corrected_text).toBe(testCase.expected.corrected);
        }
        
        expect(result.content_classification.content_type).toBe(testCase.expected.contentType);
        expect(result.intent_classification.intent).toBe(testCase.expected.intent);
        expect(result.confidence).toBeGreaterThan(0.7);
      }
    });
  });
});
