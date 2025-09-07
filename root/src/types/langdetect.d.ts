declare module 'langdetect' {
  export interface LanguageDetectionResult {
    lang: string;
    prob: number;
  }
  
  export function detect(text: string): LanguageDetectionResult[];
  export function detectOne(text: string): string;
  
  export class LanguageDetect {
    detect(text: string): LanguageDetectionResult[];
  }
}
