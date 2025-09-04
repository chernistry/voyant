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

export function validateNoCitation(reply: string, hasExternal: boolean): void {
  if (!hasExternal && /\b(Open-Meteo|REST Countries|OpenTripMap|Brave Search)\b/i.test(reply)) {
    throw new Error('citation_without_external_data');
  }
}


