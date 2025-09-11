/**
 * Utilities to enforce citation behavior:
 * - When external facts are used, compose short source mentions.
 * - When no external facts are used, ensure the reply does not fabricate sources.
 * 
 * Enhanced version available in citations.enhanced.ts with LLM-powered features.
 */

// Re-export enhanced functionality for gradual migration
export { 
  analyzeCitations, 
  verifyCitations, 
  generateCitationSummary,
  type Citation,
  type EnhancedCitation,
  type CitationAnalysis 
} from './citations.enhanced.js';

export function enforceCitations(
  facts: Array<{ source: string; data: unknown }>,
): string[] {
  return facts.map((f) => String(f.source)).filter((s) => s.trim().length > 0);
}

/**
 * Validates that no fabricated citations are present when no external facts are used
 */
export function validateNoCitation(reply: string, hasExternalFacts: boolean): void {
  if (hasExternalFacts) return; // Citations are allowed when external facts exist
  
  // Check for common citation patterns that shouldn't appear without external facts
  const citationPatterns = [
    /\[source:/i,
    /\(source:/i,
    /according to/i,
    /based on.*report/i,
    /study shows/i,
    /research indicates/i
  ];
  
  for (const pattern of citationPatterns) {
    if (pattern.test(reply)) {
      throw new Error(`Potential fabricated citation detected: ${pattern.source}`);
    }
  }
}

/**
 * Enhanced citation processing with LLM analysis (opt-in)
 */
export async function processCitations(
  citations: Array<{ url?: string; title?: string; snippet?: string; score?: number }>,
  query: string,
  content: string,
  options: { enhance?: boolean; verify?: boolean } = {}
): Promise<{
  formatted: string[];
  analysis?: import('./citations.enhanced.js').CitationAnalysis;
  verified?: { verified: any[]; suspicious: any[] };
}> {
  if (!citations.length) {
    return { formatted: [] };
  }

  // Basic formatting (always available)
  const formatted = citations.map((c, i) => 
    `${i + 1}. ${c.title || 'Internal Knowledge Base'}${c.url ? ` — ${c.url}` : ''}`
  );

  const result: any = { formatted };

  // Enhanced analysis (opt-in)
  if (options.enhance) {
    try {
      const { analyzeCitations } = await import('./citations.enhanced.js');
      result.analysis = await analyzeCitations(citations, query, content);
    } catch (error) {
      // Fallback to basic formatting if enhanced analysis fails
    }
  }

  // Citation verification (opt-in)
  if (options.verify) {
    try {
      const { verifyCitations } = await import('./citations.enhanced.js');
      result.verified = await verifyCitations(content, citations);
    } catch (error) {
      // Fallback to assuming all citations are verified
    }
  }

  return result;
}

