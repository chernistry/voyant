import type pino from 'pino';
import { z } from 'zod';

export const LanguageResult = z.object({
  language: z.string(),
  confidence: z.number().min(0).max(1),
  has_mixed_languages: z.boolean(),
  script_type: z.enum(['latin', 'cyrillic', 'japanese', 'mixed', 'unknown'])
});

export type LanguageResultT = z.infer<typeof LanguageResult>;

let langDetector: any = null;

async function getLangDetector(): Promise<any> {
  if (!langDetector) {
    try {
      // Try to use langdetect library if available
      const langdetect = await import('langdetect');
      langDetector = langdetect;
      return langDetector;
    } catch {
      // Fallback to script-based detection if library not available
      return null;
    }
  }
  return langDetector;
}

export async function detectLanguage(text: string, log?: pino.Logger): Promise<LanguageResultT> {
  // Clean text for better detection
  const cleanText = text.replace(/[^\w\s\u00C0-\u017F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ' ').trim();
  
  if (cleanText.length < 3) {
    return {
      language: 'unknown',
      confidence: 0.1,
      has_mixed_languages: false,
      script_type: 'unknown'
    };
  }

  // Script-based detection for mixed languages and script type
  const hasCyrillic = /[а-яё]/i.test(text);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasChinese = /[\u4E00-\u9FAF]/.test(text);
  
  const scriptCount = [hasCyrillic, hasJapanese, hasLatin, hasArabic, hasChinese].filter(Boolean).length;
  const has_mixed_languages = scriptCount > 1;
  
  let script_type: 'latin' | 'cyrillic' | 'japanese' | 'mixed' | 'unknown' = 'unknown';
  if (scriptCount > 1) {
    script_type = 'mixed';
  } else if (hasCyrillic) {
    script_type = 'cyrillic';
  } else if (hasJapanese || hasChinese) {
    script_type = 'japanese';
  } else if (hasLatin) {
    script_type = 'latin';
  }

  // Try library-based detection for more accurate language identification
  let language = 'unknown';
  let confidence = 0.6;
  
  try {
    const detector = await getLangDetector();
    if (detector && cleanText.length > 10) {
      const results = detector.detect(cleanText); // Use detect method directly
      if (results && results.length > 0) {
        const topResult = results[0];
        language = topResult.lang; // Language code
        confidence = Math.min(topResult.prob, 0.95); // Confidence score, capped at 0.95
        
        if (log?.debug) {
          log.debug({ 
            detectedResults: results.slice(0, 3),
            topLanguage: language,
            libraryConfidence: confidence
          }, '🌐 LANGDETECT: Library detection results');
        }
      }
    }
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ LANGDETECT: Library detection failed');
    }
  }
  
  // Fallback to script-based language assignment if library detection failed
  if (language === 'unknown' || confidence < 0.3) {
    if (hasCyrillic) {
      language = 'ru';
      confidence = 0.75;
    } else if (hasJapanese) {
      language = 'ja';
      confidence = 0.75;
    } else if (hasChinese) {
      language = 'zh';
      confidence = 0.75;
    } else if (hasArabic) {
      language = 'ar';
      confidence = 0.75;
    } else if (hasLatin) {
      language = 'en';
      confidence = 0.7;
    }
  }
  
  if (log?.debug) {
    log.debug({ 
      language,
      script_type,
      has_mixed_languages,
      confidence,
      textLength: cleanText.length,
      scriptCounts: { hasCyrillic, hasJapanese, hasLatin, hasArabic, hasChinese }
    }, '🌐 LANGUAGE: Final detection result');
  }
  
  return {
    language,
    confidence,
    has_mixed_languages,
    script_type
  };
}
