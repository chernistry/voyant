import type pino from 'pino';
import { z } from 'zod';
import { getPrompt } from './prompts.js';
import { callLLM } from './llm.js';
import { parseCity, parseDate, parseIntent } from './parsers.js';
import { routeWithLLM } from './router.llm.js';

export type Intent = 'weather'|'packing'|'attractions'|'destinations'|'unknown'|'web_search'|'system';
export type ContentType = 'system'|'travel'|'unrelated'|'budget'|'restaurant'|'flight'|'gibberish'|'emoji_only';

export type Slots = {
  city?: string;
  month?: string;
  dates?: string;
  travelerProfile?: string;
  originCity?: string;
  destCity?: string;
  // Internal flags used by graph/blend
  awaiting_search_consent?: string;
  pending_search_query?: string;
};

export type RouteResult = {
  intent: Intent;
  needExternal: boolean;
  slots: Slots;
  confidence: number;   // 0..1
  missingSlots: string[];
};

const ContentClassification = z.object({
  content_type: z.union([
    z.literal('system'),
    z.literal('travel'),
    z.literal('unrelated'),
    z.literal('budget'),
    z.literal('restaurant'),
    z.literal('flight'),
    z.literal('gibberish'),
    z.literal('emoji_only'),
  ]),
  is_explicit_search: z.boolean(),
  has_mixed_languages: z.boolean().optional().default(false),
  needs_web_search: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional().default(0.6),
});
export type ContentClassificationT = z.infer<typeof ContentClassification>;

export async function classifyContentLLM(
  message: string,
  log: pino.Logger,
  opts: { timeoutMs?: number } = {}
): Promise<ContentClassificationT | null> {
  try {
    const tmpl = await getPrompt('nlp_content_classification');
    const prompt = tmpl.replace('{message}', message);
    // Prefer JSON response format for strictness
    const raw = await callLLM(prompt, { responseFormat: 'json', log });
    // Some providers echo extra text; try strict JSON first, then extract
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed) return null;
    return ContentClassification.parse(parsed);
  } catch (e) {
    if (log?.debug) log.debug({ err: String(e) }, 'nlp_classify_content_failed');
    return null;
  }
}

export async function detectIntentAndSlots(
  message: string,
  context: Slots,
  log: pino.Logger,
  _opts: { timeoutMs?: number; minConfidence?: number } = {}
): Promise<RouteResult> {
  // Use existing enhanced LLM router for robust routing + slots
  const via = await routeWithLLM(message, context as Record<string, string>, { log }).catch(() => undefined);
  if (via) {
    const missing: string[] = via.missingSlots || [];
    return {
      intent: via.intent as Intent,
      needExternal: via.needExternal,
      slots: via.slots as Slots,
      confidence: via.confidence,
      missingSlots: missing,
    };
  }
  // Fallback to the intent parser + individual parsers
  const intentRes = await parseIntent(message, context, log).catch(() => ({ success: false, confidence: 0 }));
  const slots: Slots = { ...context };
  if (intentRes?.success && 'data' in intentRes && intentRes.data) {
    Object.assign(slots, intentRes.data.slots);
  } else {
    // best-effort slot extraction
    const city = await parseCity(message, context, log).catch(() => ({ success: false } as const));
    if (city?.success && city.data?.normalized) slots.city = city.data.normalized;
    const date = await parseDate(message, context, log).catch(() => ({ success: false } as const));
    if (date?.success && date.data?.dates) {
      slots.dates = date.data.dates;
      if (date.data.month) slots.month = date.data.month;
    }
  }
  const missing: string[] = [];
  const inferred = intentRes?.success && 'data' in intentRes && intentRes.data ? intentRes.data.intent : 'unknown';
  if ((inferred === 'destinations' || inferred === 'packing' || inferred === 'weather' || inferred === 'attractions')) {
    if (!slots.city) missing.push('city');
    if (inferred === 'destinations' && !slots.dates && !slots.month) missing.push('dates');
    if (inferred === 'packing' && !slots.dates && !slots.month) missing.push('dates');
  }
  return {
    intent: inferred as Intent,
    needExternal: inferred !== 'unknown' && missing.length === 0,
    slots,
    confidence: intentRes?.confidence ?? 0.4,
    missingSlots: missing,
  };
}

export async function extractCityLLM(message: string, context: Slots, log: pino.Logger): Promise<string | undefined> {
  const r = await parseCity(message, context, log).catch(() => ({ success: false } as const));
  return r?.success && r.data?.normalized ? r.data.normalized : undefined;
}

export async function parseDatesLLM(message: string, context: Slots, log: pino.Logger): Promise<{ dates?: string; month?: string } | undefined> {
  const r = await parseDate(message, context, log).catch(() => ({ success: false } as const));
  if (r?.success && r.data) return { dates: r.data.dates, month: r.data.month };
  return undefined;
}

export async function clarifierLLM(missing: string[], context: Slots, log: pino.Logger): Promise<string> {
  try {
    const tmpl = await getPrompt('nlp_clarifier');
    const prompt = tmpl
      .replace('{missing_slots}', JSON.stringify(missing))
      .replace('{context}', JSON.stringify(context));
    const raw = await callLLM(prompt, { log });
    const q = raw.trim();
    // If response is empty or does not reference missing slots clearly, use deterministic fallback
    const lower = q.toLowerCase();
    const slotsCovered = missing.every((m) => lower.includes(m.toLowerCase()));
    const isProviderError = /technical difficulties|try again|error/i.test(lower);
    return q.length > 0 && slotsCovered && !isProviderError ? q : fallbackClarifier(missing);
  } catch {
    return fallbackClarifier(missing);
  }
}

function fallbackClarifier(missing: string[]): string {
  const miss = new Set(missing.map((m) => m.toLowerCase()));
  if (miss.has('dates') && miss.has('city')) return 'Could you share the city and month/dates?';
  if (miss.has('dates')) return 'Which month or travel dates?';
  if (miss.has('city')) return 'Which city are you asking about?';
  return 'Could you provide more details about your travel plans?';
}
