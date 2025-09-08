/**
 * Utilities to enforce citation behavior:
 * - When external facts are used, compose short source mentions.
 * - When no external facts are used, ensure the reply does not fabricate sources.
 */
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




