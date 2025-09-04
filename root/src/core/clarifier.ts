/**
 * Build a single targeted clarifying question based on missing slots.
 * Returns exactly one concise question; stable phrasing to match tests.
 */
export function buildClarifyingQuestion(
  missing: string[],
  slots: Record<string, string> = {},
): string {
  const miss = new Set(missing.map((m) => m.toLowerCase()));
  if (miss.has('dates') && miss.has('city')) {
    // Keep wording aligned with existing tests
    return 'Could you share the city and month/dates?';
  }
  if (miss.has('dates')) {
    // Match exact test expectation for destinations - no city suffix
    return 'Which month or travel dates?';
  }
  if (miss.has('city')) {
    return 'Which city are you asking about?';
  }
  return 'Could you provide more details about your travel plans?';
}


