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

// Travel-specific typo dictionary for local correction
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
  // Use dictionary-based correction since no local spell correction model is available
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
    }, '✏️ TRANSFORMERS: Applied dictionary corrections');
  }
  
  return {
    corrected_text: correctedText,
    corrections,
    confidence
  };
}
