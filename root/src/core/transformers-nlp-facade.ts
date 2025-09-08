import type pino from 'pino';
import { z } from 'zod';
import { classifyContent, classifyIntent, type ContentClassificationT, type IntentClassificationT } from './transformers-classifier.js';

import { detectLanguage, type LanguageResultT } from './transformers-detector.js';
import { extractEntities } from './ner.js';

export const NLPResult = z.object({
  confidence: z.number(),
  entities: z.array(z.object({
    text: z.string(),
    entity_group: z.string(),
    score: z.number()
  })),
  content_classification: z.object({
    content_type: z.enum(['travel', 'system', 'unrelated', 'budget', 'refinement']),
    confidence: z.number(),
    intent: z.enum(['weather', 'packing', 'attractions', 'destinations']).optional()
  }),
  intent_classification: z.object({
    intent: z.enum(['weather', 'packing', 'attractions', 'destinations', 'system', 'unknown']),
    confidence: z.number()
  }),
  language_detection: z.object({
    language: z.string(),
    confidence: z.number(),
    has_mixed_languages: z.boolean(),
    script_type: z.enum(['latin', 'cyrillic', 'japanese', 'hebrew', 'mixed', 'unknown'])
  })
});

export type NLPResultT = z.infer<typeof NLPResult>;

export class TransformersNLP {
  private log?: pino.Logger;
  
  constructor(log?: pino.Logger) {
    this.log = log;
  }
  
  async process(text: string): Promise<NLPResultT> {
    const startTime = Date.now();
    
    // Parallel processing of text
    const [
      contentClassification,
      intentClassification, 
      languageDetection,
      entities
    ] = await Promise.all([
      classifyContent(text, this.log),
      classifyIntent(text, this.log),
      detectLanguage(text, this.log),
      extractEntities(text, this.log).catch(() => [])
    ]);
    
    // Calculate overall confidence as weighted average
    const weights = {
      content: 0.4,
      intent: 0.4,
      language: 0.2
    };
    
    const overallConfidence = (
      contentClassification.confidence * weights.content +
      intentClassification.confidence * weights.intent +
      languageDetection.confidence * weights.language
    );
    
    const processingTime = Date.now() - startTime;
    
    if (this.log?.debug) {
      this.log.debug({
        processingTime,
        overallConfidence,
        entities: entities.length,
        contentType: contentClassification.content_type,
        intent: intentClassification.intent
      }, '🧠 TRANSFORMERS: NLP processing complete');
    }
    
    return {
      confidence: overallConfidence,
      entities,
      content_classification: contentClassification,
      intent_classification: intentClassification,
      language_detection: languageDetection
    };
  }
}
