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

let classifierReady: Promise<any> | null = null;

async function loadClassifier(log?: pino.Logger): Promise<any> {
  try {
    const { pipeline } = await import('@huggingface/transformers');
    
    if (log?.debug) {
      log.debug({}, '🤖 TRANSFORMERS: Loading classification pipeline');
    }
    
    const classifier = await pipeline('text-classification', 'microsoft/DialoGPT-medium', {
      // Use zero-shot classification for content types
    } as any);
    
    if (log?.debug) {
      log.debug({}, '✅ TRANSFORMERS: Classification pipeline loaded');
    }
    
    return classifier;
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ TRANSFORMERS: Classification pipeline failed');
    }
    throw e;
  }
}

export async function classifyContent(text: string, log?: pino.Logger): Promise<ContentClassificationT> {
  const m = text.toLowerCase();
  
  // Fast rule-based classification for clear cases
  if (/are you (a )?real|are you (an? )?person|are you (an? )?(ai|bot|robot|human)/i.test(m)) {
    return { content_type: 'system', confidence: 0.95 };
  }
  
  if (/budget|cost|price|money|expensive|cheap|afford|spend|currency exchange|exchange rate/i.test(m)) {
    return { content_type: 'budget', confidence: 0.9 };
  }
  
  if (/\b(cook|recipe|pasta|food|programming|code|software|computer|technology|politics|sports|music|movie|film)\b/i.test(m)) {
    return { content_type: 'unrelated', confidence: 0.9 };
  }
  
  // Travel-related patterns
  if (/\b(weather|temperature|climate|forecast|rain|sunny|cloudy|hot|cold|degrees?|pack|bring|clothes|items|luggage|suitcase|wear|attraction|do in|what to do|museum|activities|destination|where should i go|where to go)\b/i.test(m)) {
    let intent: 'weather' | 'packing' | 'attractions' | 'destinations' | undefined;
    
    if (/\b(weather|temperature|climate|forecast|rain|sunny|cloudy|hot|cold|degrees?)\b/i.test(m)) {
      intent = 'weather';
    } else if (/pack|bring|clothes|items|luggage|suitcase|wear/.test(m)) {
      intent = 'packing';
    } else if (/attraction|do in|what to do|museum|activities/.test(m)) {
      intent = 'attractions';
    } else if (/destination|where should i go|where to go/.test(m)) {
      intent = 'destinations';
    }
    
    return { content_type: 'travel', confidence: 0.85, intent };
  }
  
  // Default to travel with lower confidence
  return { content_type: 'travel', confidence: 0.6 };
}

export async function classifyIntent(text: string, log?: pino.Logger): Promise<IntentClassificationT> {
  const m = text.toLowerCase();
  
  // System questions
  if (/are you (a )?real|are you (an? )?person|are you (an? )?(ai|bot|robot|human)/i.test(m)) {
    return { intent: 'system', confidence: 0.95 };
  }
  
  // Weather patterns
  if (/\b(weather|temperature|climate|forecast|rain|sunny|cloudy|hot|cold|degrees?)\b/i.test(m) || 
      /what'?s?\s+(the\s+)?weather/i.test(m)) {
    return { intent: 'weather', confidence: 0.95 };
  }
  
  // Packing patterns
  if (/pack|bring|clothes|items|luggage|suitcase|wear/.test(m)) {
    return { intent: 'packing', confidence: 0.9 };
  }
  
  // Attractions patterns
  if (/attraction|do in|what to do|museum|activities/.test(m)) {
    return { intent: 'attractions', confidence: 0.85 };
  }
  
  // Destinations patterns
  if (/destination|where should i go|where to go|tell me about.*country/.test(m)) {
    return { intent: 'destinations', confidence: 0.8 };
  }
  
  return { intent: 'unknown', confidence: 0.4 };
}
