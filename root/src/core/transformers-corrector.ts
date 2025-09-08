import type pino from 'pino';
import { z } from 'zod';

export const CorrectionResult = z.object({
  corrected_text: z.string(),
  corrections: z.array(z.object({
    original: z.string(),
    corrected: z.string(),
    confidence: z.number()
  })),
  confidence: z.number()
});

export type CorrectionResultT = z.infer<typeof CorrectionResult>;

let spellCorrector: Promise<any> | null = null;

async function loadSpellCorrector(log?: pino.Logger): Promise<any> {
  if (!spellCorrector) {
    spellCorrector = (async () => {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        
        if (log?.debug) {
          log.debug({}, '🤖 TRANSFORMERS: Loading spell correction pipeline');
        }
        
        // Use text2text-generation for spell correction
        const corrector = await pipeline('text2text-generation', 'oliverguhr/spelling-correction-english-base');
        
        if (log?.debug) {
          log.debug({}, '✅ TRANSFORMERS: Spell correction pipeline loaded');
        }
        
        return corrector;
      } catch (e) {
        if (log?.debug) {
          log.debug({ error: String(e) }, '❌ TRANSFORMERS: Spell correction pipeline failed');
        }
        throw e;
      }
    })();
  }
  return spellCorrector;
}

// Fallback travel-specific typo dictionary for when Transformers fails
const TRAVEL_TYPOS: Record<string, string> = {
  'weaher': 'weather',
  'wheather': 'weather', 
  'wether': 'weather',
  'packin': 'packing',
  'packng': 'packing',
  'atraction': 'attraction',
  'atractions': 'attractions',
  'destinaton': 'destination',
  'destiation': 'destination',
  'berln': 'berlin',
  'pars': 'paris',
  'londn': 'london',
  'tokio': 'tokyo',
  'madrd': 'madrid',
  'barcelon': 'barcelona',
  'amsterdm': 'amsterdam'
};

export async function correctSpelling(text: string, log?: pino.Logger): Promise<CorrectionResultT> {
  try {
    const corrector = await loadSpellCorrector(log);
    
    // Use Transformers for context-aware spell correction
    const result = await corrector(text, {
      max_length: text.length + 50,
      num_return_sequences: 1
    });
    
    const correctedText = result[0]?.generated_text || text;
    const corrections: Array<{ original: string; corrected: string; confidence: number }> = [];
    
    // Simple diff to identify corrections (basic implementation)
    if (correctedText !== text) {
      const words = text.split(/\s+/);
      const correctedWords = correctedText.split(/\s+/);
      
      for (let i = 0; i < Math.min(words.length, correctedWords.length); i++) {
        const original = words[i];
        const corrected = correctedWords[i];
        if (original && corrected && original !== corrected) {
          corrections.push({
            original,
            corrected,
            confidence: 0.85
          });
        }
      }
    }
    
    const confidence = corrections.length > 0 ? 0.85 : 1.0;
    
    if (log?.debug && corrections.length > 0) {
      log.debug({ 
        corrections: corrections.length,
        original: text,
        corrected: correctedText 
      }, '✏️ TRANSFORMERS: Applied spell corrections');
    }
    
    return {
      corrected_text: correctedText,
      corrections,
      confidence
    };
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ TRANSFORMERS: Spell correction failed, using fallback');
    }
    
    // Fallback to dictionary-based correction
    let correctedText = text;
    const corrections: Array<{ original: string; corrected: string; confidence: number }> = [];
    
    for (const [typo, correction] of Object.entries(TRAVEL_TYPOS)) {
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      const matches = text.match(regex);
      
      if (matches) {
        correctedText = correctedText.replace(regex, correction);
        corrections.push({
          original: typo,
          corrected: correction,
          confidence: 0.95
        });
      }
    }
    
    const confidence = corrections.length > 0 ? 0.9 : 1.0;
    
    if (log?.debug && corrections.length > 0) {
      log.debug({ 
        corrections: corrections.length,
        original: text,
        corrected: correctedText 
      }, '✏️ FALLBACK: Applied dictionary corrections');
    }
    
    return {
      corrected_text: correctedText,
      corrections,
      confidence
    };
  }
}
