import { z } from 'zod';
import { getPrompt } from './prompts.js';
import { callLLM } from './llm.js';
import { parseCity, parseDate, parseIntent } from './parsers.js';
import { routeWithLLM } from './router.llm.js';
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
export async function classifyContentLLM(message, log, opts = {}) {
    try {
        const tmpl = await getPrompt('nlp_content_classification');
        const prompt = tmpl.replace('{message}', message);
        // Prefer JSON response format for strictness
        const raw = await callLLM(prompt, { responseFormat: 'json', log });
        // Some providers echo extra text; try strict JSON first, then extract
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            const m = raw.match(/\{[\s\S]*\}/);
            parsed = m ? JSON.parse(m[0]) : null;
        }
        if (!parsed)
            return null;
        return ContentClassification.parse(parsed);
    }
    catch (e) {
        if (log?.debug)
            log.debug({ err: String(e) }, 'nlp_classify_content_failed');
        return null;
    }
}
export async function detectIntentAndSlots(message, context, log, _opts = {}) {
    // Use existing enhanced LLM router for robust routing + slots
    const via = await routeWithLLM(message, context, { log }).catch(() => undefined);
    if (via) {
        const missing = via.missingSlots || [];
        return {
            intent: via.intent,
            needExternal: via.needExternal,
            slots: via.slots,
            confidence: via.confidence,
            missingSlots: missing,
        };
    }
    // Fallback to the intent parser + individual parsers
    const intentRes = await parseIntent(message, context, log).catch(() => ({ success: false, confidence: 0 }));
    const slots = { ...context };
    if (intentRes?.success && 'data' in intentRes && intentRes.data) {
        Object.assign(slots, intentRes.data.slots);
    }
    else {
        // best-effort slot extraction
        const city = await parseCity(message, context, log).catch(() => ({ success: false }));
        if (city?.success && city.data?.normalized)
            slots.city = city.data.normalized;
        const date = await parseDate(message, context, log).catch(() => ({ success: false }));
        if (date?.success && date.data?.dates) {
            slots.dates = date.data.dates;
            if (date.data.month)
                slots.month = date.data.month;
        }
    }
    const missing = [];
    const inferred = intentRes?.success && 'data' in intentRes && intentRes.data ? intentRes.data.intent : 'unknown';
    if ((inferred === 'destinations' || inferred === 'packing' || inferred === 'weather' || inferred === 'attractions')) {
        if (!slots.city)
            missing.push('city');
        if (inferred === 'destinations' && !slots.dates && !slots.month)
            missing.push('dates');
        if (inferred === 'packing' && !slots.dates && !slots.month)
            missing.push('dates');
    }
    return {
        intent: inferred,
        needExternal: inferred !== 'unknown' && missing.length === 0,
        slots,
        confidence: intentRes?.confidence ?? 0.4,
        missingSlots: missing,
    };
}
export async function extractCityLLM(message, context, log) {
    const r = await parseCity(message, context, log).catch(() => ({ success: false }));
    return r?.success && r.data?.normalized ? r.data.normalized : undefined;
}
export async function parseDatesLLM(message, context, log) {
    const r = await parseDate(message, context, log).catch(() => ({ success: false }));
    if (r?.success && r.data)
        return { dates: r.data.dates, month: r.data.month };
    return undefined;
}
export async function clarifierLLM(missing, context, log) {
    try {
        const tmpl = await getPrompt('nlp_clarifier');
        const prompt = tmpl
            .replace('{missing_slots}', JSON.stringify(missing))
            .replace('{context}', JSON.stringify(context));
        const raw = await callLLM(prompt, { log });
        const q = raw.trim();
        return q.length > 0 ? q : fallbackClarifier(missing);
    }
    catch {
        return fallbackClarifier(missing);
    }
}
function fallbackClarifier(missing) {
    const miss = new Set(missing.map((m) => m.toLowerCase()));
    if (miss.has('dates') && miss.has('city'))
        return 'Could you share the city and month/dates?';
    if (miss.has('dates'))
        return 'Which month or travel dates?';
    if (miss.has('city'))
        return 'Which city are you asking about?';
    return 'Could you provide more details about your travel plans?';
}
