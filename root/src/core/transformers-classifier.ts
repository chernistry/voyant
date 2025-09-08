// Configure Transformers.js environment FIRST
import './transformers-env.js';

import type pino from 'pino';
import { z } from 'zod';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Run zero-shot classification in a child Node process (avoids Jest realm issues). */
async function zeroShotInChild(
  modelName: string,
  text: string,
  candidateLabels: string[],
): Promise<any> {
  const runner = path.resolve(process.cwd(), 'scripts/transformers-child.cjs');
  const child = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'inherit'] });

  const payload = JSON.stringify({
    task: 'zero-shot-classification',
    model: modelName,
    text,
    candidateLabels,
  });

  return await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => (out += c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      } else {
        reject(new Error(`transformers-child exited with code ${code}`));
      }
    });
    child.stdin.end(payload);
  });
}

/** Run NER in a child Node process (avoids Jest realm issues). */
async function nerInChild(
  modelName: string,
  text: string,
): Promise<any> {
  const runner = path.resolve(process.cwd(), 'scripts/transformers-child.cjs');
  const child = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'inherit'] });

  const payload = JSON.stringify({
    task: 'token-classification',
    model: modelName,
    text,
  });

  return await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => (out += c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      } else {
        reject(new Error(`transformers-child exited with code ${code}`));
      }
    });
    child.stdin.end(payload);
  });
}

// Export the NER helper for use in ner.ts
export { nerInChild };

export const ContentClassification = z.object({
  content_type: z.enum(['travel', 'system', 'unrelated', 'budget', 'refinement']),
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

function getClassificationModel(): string {
  const useLocal = process.env.NER_USE_LOCAL === 'true';
  return useLocal 
    ? (process.env.TRANSFORMERS_CLASSIFICATION_MODEL_LOCAL || 'Xenova/nli-deberta-v3-base')
    : (process.env.TRANSFORMERS_CLASSIFICATION_MODEL_REMOTE || 'facebook/bart-large-mnli');
}

async function loadContentClassifier(log?: pino.Logger): Promise<any> {
  if (!contentClassifier) {
    contentClassifier = (async () => {
      try {
        const modelName = getClassificationModel();
        
        if (log?.debug) {
          log.debug({ model: modelName }, '🤖 TRANSFORMERS: Loading content classification pipeline');
        }
        
        const isJest = !!process.env.JEST_WORKER_ID;
        
        if (isJest) {
          // ✅ Avoid Float32Array realm mismatch inside Jest
          if (log?.debug) {
            log.debug({ model: modelName }, '✅ TRANSFORMERS: Content classification pipeline loaded (child process)');
          }
          return { 
            classify: (text: string, candidateLabels: string[]) => 
              zeroShotInChild(modelName, text, candidateLabels)
          };
        } else {
          // Normal path (CLI / prod)
          const { pipeline } = await import('@huggingface/transformers');
          const classifier = await pipeline('zero-shot-classification', modelName);
          
          if (log?.debug) {
            log.debug({ model: modelName }, '✅ TRANSFORMERS: Content classification pipeline loaded');
          }
          
          return { classify: classifier };
        }
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
        const modelName = getClassificationModel();
        
        if (log?.debug) {
          log.debug({ model: modelName }, '🤖 TRANSFORMERS: Loading intent classification pipeline');
        }
        
        const isJest = !!process.env.JEST_WORKER_ID;
        
        if (isJest) {
          // ✅ Avoid Float32Array realm mismatch inside Jest
          if (log?.debug) {
            log.debug({ model: modelName }, '✅ TRANSFORMERS: Intent classification pipeline loaded (child process)');
          }
          return { 
            classify: (text: string, candidateLabels: string[]) => 
              zeroShotInChild(modelName, text, candidateLabels)
          };
        } else {
          // Normal path (CLI / prod)
          const { pipeline } = await import('@huggingface/transformers');
          const classifier = await pipeline('zero-shot-classification', modelName);
          
          if (log?.debug) {
            log.debug({ model: modelName }, '✅ TRANSFORMERS: Intent classification pipeline loaded');
          }
          
          return { classify: classifier };
        }
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
    
    const candidateLabels = ['travel', 'system', 'unrelated', 'budget', 'refinement'];
    const result = await classifier.classify(text, candidateLabels);
    
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
    
    // Handle refinement patterns as travel content
    if (/\b(make it|kid-friendly|family-friendly|budget-friendly|shorter flight|less expensive|more luxury)\b/i.test(m)) {
      return { content_type: 'travel', confidence: 0.9 };
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
    const result = await classifier.classify(text, candidateLabels);
    
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
    
    // Handle refinement patterns - these should not be classified as system
    if (/\b(make it|kid-friendly|family-friendly|budget-friendly|shorter flight|less expensive|more luxury)\b/i.test(m)) {
      return { intent: 'unknown', confidence: 0.3 }; // Low confidence to let graph handle refinement
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
