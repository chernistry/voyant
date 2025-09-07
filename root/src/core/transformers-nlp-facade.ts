import type pino from 'pino';
import { z } from 'zod';
import { classifyContent, classifyIntent, type ContentClassificationT, type IntentClassificationT } from './transformers-classifier.js';
import { correctSpelling, type CorrectionResultT } from './transformers-corrector.js';
import { detectLanguage, type LanguageResultT } from './transformers-detector.js';
import { extractEntities } from './ner.js';

export const NLPResult = z.object({
  corrected_text: z.string(),
  content_classification: z.object({
    content_type: z.enum(['travel', 'system', 'unrelated', 'budget']),
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
    script_type: z.enum(['latin', 'cyrillic', 'japanese', 'mixed', 'unknown'])
  }),
  entities: z.array(z.object({
    entity_group: z.string(),
    score: z.number(),
    text: z.string()
  })),
  corrections: z.array(z.object({
    original: z.string(),
    corrected: z.string(),
    confidence: z.number()
  })),
  confidence: z.number()
});

export type NLPResultT = z.infer<typeof NLPResult>;

export class TransformersNLP {
  private log?: pino.Logger;
  
  constructor(log?: pino.Logger) {
    this.log = log;
  }
  
  async process(text: string): Promise<NLPResultT> {
    const startTime = Date.now();
    
    // Step 1: Spell correction
    const correctionResult = await correctSpelling(text, this.log);
    const correctedText = correctionResult.corrected_text;
    
    // Step 2: Parallel processing of corrected text
    const [
      contentClassification,
      intentClassification, 
      languageDetection,
      entities
    ] = await Promise.all([
      classifyContent(correctedText, this.log),
      classifyIntent(correctedText, this.log),
      detectLanguage(correctedText, this.log),
      extractEntities(correctedText, this.log).catch(() => [])
    ]);
    
    // Calculate overall confidence as weighted average
    const weights = {
      content: 0.3,
      intent: 0.4,
      language: 0.2,
      correction: 0.1
    };
    
    const overallConfidence = (
      contentClassification.confidence * weights.content +
      intentClassification.confidence * weights.intent +
      languageDetection.confidence * weights.language +
      correctionResult.confidence * weights.correction
    );
    
    const processingTime = Date.now() - startTime;
    
    if (this.log?.debug) {
      this.log.debug({
        processingTime,
        overallConfidence,
        corrections: correctionResult.corrections.length,
        entities: entities.length,
        contentType: contentClassification.content_type,
        intent: intentClassification.intent
      }, '🧠 TRANSFORMERS: NLP processing complete');
    }
    
    return {
      corrected_text: correctedText,
      content_classification: contentClassification,
      intent_classification: intentClassification,
      language_detection: languageDetection,
      entities,
      corrections: correctionResult.corrections,
      confidence: overallConfidence
    };
  }
}
