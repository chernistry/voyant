import type pino from 'pino';
import { z } from 'zod';

export const ContentClassification = z.object({
  content_type: z.enum(['travel', 'system', 'unrelated', 'budget']),
  confidence: z.number().min(0).max(1),
  intent: z.enum(['weather', 'packing', 'attractions', 'destinations']).optional()
});

export const IntentClassification = z.object({
  intent: z.enum(['weather', 'packing', 'attractions', 'destinations', 'system', 'unknown']),
  confidence: z.number().min(0).max(1)
});

export type ContentClassificationT = z.infer<typeof ContentClassification>;
export type IntentClassificationT = z.infer<typeof IntentClassification>;

let contentClassifier: Promise<any> | null = null;
let intentClassifier: Promise<any> | null = null;

async function loadContentClassifier(log?: pino.Logger): Promise<any> {
  if (!contentClassifier) {
    contentClassifier = (async () => {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        
        if (log?.debug) {
          log.debug({}, '🤖 TRANSFORMERS: Loading content classification pipeline');
        }
        
        const classifier = await pipeline('zero-shot-classification', 'facebook/bart-large-mnli');
        
        if (log?.debug) {
          log.debug({}, '✅ TRANSFORMERS: Content classification pipeline loaded');
        }
        
        return classifier;
      } catch (e) {
        if (log?.debug) {
          log.debug({ error: String(e) }, '❌ TRANSFORMERS: Content classification pipeline failed');
        }
        throw e;
      }
    })();
  }
  return contentClassifier;
}

async function loadIntentClassifier(log?: pino.Logger): Promise<any> {
  if (!intentClassifier) {
    intentClassifier = (async () => {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        
        if (log?.debug) {
          log.debug({}, '🤖 TRANSFORMERS: Loading intent classification pipeline');
        }
        
        const classifier = await pipeline('zero-shot-classification', 'facebook/bart-large-mnli');
        
        if (log?.debug) {
          log.debug({}, '✅ TRANSFORMERS: Intent classification pipeline loaded');
        }
        
        return classifier;
      } catch (e) {
        if (log?.debug) {
          log.debug({ error: String(e) }, '❌ TRANSFORMERS: Intent classification pipeline failed');
        }
        throw e;
      }
    })();
  }
  return intentClassifier;
}

export async function classifyContent(text: string, log?: pino.Logger): Promise<ContentClassificationT> {
  try {
    const classifier = await loadContentClassifier(log);
    
    const candidateLabels = ['travel', 'system', 'unrelated', 'budget'];
    const result = await classifier(text, candidateLabels);
    
    const topLabel = result.labels[0];
    const confidence = result.scores[0];
    
    // Determine intent for travel content
    let intent: 'weather' | 'packing' | 'attractions' | 'destinations' | undefined;
    if (topLabel === 'travel' && confidence > 0.7) {
      const intentResult = await classifyIntent(text, log);
      if (intentResult.confidence > 0.6) {
        intent = intentResult.intent as any;
      }
    }
    
    if (log?.debug) {
      log.debug({ 
        text: text.substring(0, 50),
        content_type: topLabel,
        confidence,
        intent 
      }, '🎯 TRANSFORMERS: Content classified');
    }
    
    return {
      content_type: topLabel as any,
      confidence,
      intent
    };
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ TRANSFORMERS: Content classification failed, using fallback');
    }
    
    // Fallback to fast rule-based classification
    const m = text.toLowerCase();
    
    if (/are you (a )?real|are you (an? )?person|are you (an? )?(ai|bot|robot|human)/i.test(m)) {
      return { content_type: 'system', confidence: 0.95 };
    }
    
    if (/budget|cost|price|money|expensive|cheap|afford|spend|currency exchange|exchange rate/i.test(m)) {
      return { content_type: 'budget', confidence: 0.9 };
    }
    
    if (/\b(cook|recipe|pasta|food|programming|code|software|computer|technology|politics|sports|music|movie|film)\b/i.test(m)) {
      return { content_type: 'unrelated', confidence: 0.9 };
    }
    
    return { content_type: 'travel', confidence: 0.6 };
  }
}

export async function classifyIntent(text: string, log?: pino.Logger): Promise<IntentClassificationT> {
  try {
    const classifier = await loadIntentClassifier(log);
    
    const candidateLabels = ['weather', 'packing', 'attractions', 'destinations', 'system', 'unknown'];
    const result = await classifier(text, candidateLabels);
    
    const topLabel = result.labels[0];
    const confidence = result.scores[0];
    
    if (log?.debug) {
      log.debug({ 
        text: text.substring(0, 50),
        intent: topLabel,
        confidence 
      }, '🎯 TRANSFORMERS: Intent classified');
    }
    
    return {
      intent: topLabel as any,
      confidence
    };
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ TRANSFORMERS: Intent classification failed, using fallback');
    }
    
    // Fallback to fast rule-based classification
    const m = text.toLowerCase();
    
    if (/are you (a )?real|are you (an? )?person|are you (an? )?(ai|bot|robot|human)/i.test(m)) {
      return { intent: 'system', confidence: 0.95 };
    }
    
    if (/\b(weather|temperature|climate|forecast|rain|sunny|cloudy|hot|cold|degrees?)\b/i.test(m) || 
        /what'?s?\s+(the\s+)?weather/i.test(m)) {
      return { intent: 'weather', confidence: 0.95 };
    }
    
    if (/pack|bring|clothes|items|luggage|suitcase|wear/.test(m)) {
      return { intent: 'packing', confidence: 0.9 };
    }
    
    if (/attraction|do in|what to do|museum|activities/.test(m)) {
      return { intent: 'attractions', confidence: 0.85 };
    }
    
    if (/destination|where should i go|where to go|tell me about.*country/.test(m)) {
      return { intent: 'destinations', confidence: 0.8 };
    }
    
    return { intent: 'unknown', confidence: 0.4 };
  }
}
