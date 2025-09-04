import { generateClarifyingQuestion } from './llm.js';

/**
 * Build a single targeted clarifying question based on missing slots.
 * Uses LLM for context-aware generation with fallback to hardcoded logic.
 * Returns exactly one concise question; stable phrasing to match tests.
 */
export async function buildClarifyingQuestion(
  missing: string[],
  slots: Record<string, string> = {},
  log?: any,
): Promise<string> {
  // Try LLM first for context-aware clarification
  try {
    const llmQuestion = await generateClarifyingQuestion(missing, slots, log);
    if (llmQuestion && llmQuestion.trim().length > 0) {
      return llmQuestion.trim();
    }
  } catch (error) {
    if (log) log.debug('LLM clarification failed, using fallback');
  }
  
  // Fallback to hardcoded logic for consistency with existing tests
  return fallbackBuildClarifyingQuestion(missing, slots);
}

// Fallback implementation for when LLM fails
function fallbackBuildClarifyingQuestion(
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


