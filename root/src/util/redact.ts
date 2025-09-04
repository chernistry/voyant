/**
 * Redaction utilities for logs. Replaces city names and dates in strings.
 * Redaction is disabled when LOG_LEVEL=debug to aid local debugging.
 */

function scrubString(input: string): string {
  let out = input;
  // Replace date ranges like YYYY-MM-DD..YYYY-MM-DD first
  out = out.replace(
    /\b\d{4}-\d{2}-\d{2}\s*\.\.\s*\d{4}-\d{2}-\d{2}\b/g,
    '[REDACTED_DATES]',
  );
  // Replace ISO dates (YYYY-MM-DD)
  out = out.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[REDACTED_DATE]');
  // Replace month names (Jan..Dec)
  out = out.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi,
    '[REDACTED_MONTH]',
  );
  // Replace simple city patterns following "in" or "to"
  out = out.replace(/\b(in|to)\s+[A-Z][A-Za-z\- ]+/g, '$1 [REDACTED_CITY]');
  return out;
}

function scrubDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubDeep(v, seen);
  }
  return out;
}

/**
 * Scrub PII-like patterns from a log argument.
 */
export function scrubPII(arg: unknown, enabled: boolean): unknown {
  if (!enabled) return arg;
  return scrubDeep(arg);
}

/**
 * Convenience for messages.
 */
export function scrubMessage(msg: string, enabled: boolean): string {
  return enabled ? scrubString(msg) : msg;
}


