/**
 * Graph optimization helpers: Guards, Cache, Decision Table
 * Implements G-E-R-A pattern: Guard → Extract → Route → Act
 */

import type pino from 'pino';
import type { Entities } from './ner-enhanced.js';

// Precompiled regex patterns
export const RE = {
  policy: /\b(visa|passport|entry|baggage|refund|policy|fare\s*rules?)\b/i,
  webish: /\b(prices?|fare|deals?|events?|this\s+week(end)?|hotels?\s+under\s+\$?\d+)\b/i,
  yes: /^(yes|y|sure|ok(ay)?|proceed|go(\s*ahead)?|do\s*it)$/i,
  no: /^(no|n|nope|skip|pass|cancel|nah)$/i,
  wh: /^(what|where|how|when|which|who|why|can|should|do|is|are)/i,
  flight: /(airline|flight|fly|plane|ticket|booking)/i,
  shortTime: /\b(\d+)\s*-?\s*(hour|hr|minute|min)\b|day\s*trip/i,
  seasonG: /\b(winter|summer|spring|fall|autumn)\b/gi,
};

// Per-turn cache for single extraction pass
export type TurnCache = {
  msgRaw: string;
  msgL: string;
  words: Set<string>;
  ner?: Entities;
  clsContent?: { content_type: string; confidence: number };
  clsIntent?: { intent: string; confidence: number };
};

export async function buildTurnCache(message: string, log: pino.Logger): Promise<TurnCache> {
  const msgL = message.toLowerCase().trim();
  const words = new Set(msgL.split(/\s+/).filter(w => w.length > 2));
  return { msgRaw: message, msgL, words };
}

// Guard stage helpers
export function checkYesNoShortcut(message: string): 'yes' | 'no' | null {
  const msg = message.toLowerCase().trim();
  if (RE.yes.test(msg)) return 'yes';
  if (RE.no.test(msg)) return 'no';
  return null;
}

export function checkPolicyHit(message: string): boolean {
  return RE.policy.test(message);
}

export function checkWebishHit(message: string): boolean {
  return RE.webish.test(message);
}

// Decision table types
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'policy' | 'flights' | 'unknown' | 'web_search' | 'system'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

export type RuleContext = {
  C: TurnCache;
  slots: Record<string, string>;
  forced?: string;
  threadId: string;
  log: pino.Logger;
};

export type Rule = (ctx: RuleContext) => Promise<NodeOut | null> | NodeOut | null;

// Fast-path weather rule
export async function maybeFastWeather(ctx: RuleContext): Promise<NodeOut | null> {
  if (!ctx.C.clsIntent || !ctx.C.ner) return null;
  
  const { intent, confidence } = ctx.C.clsIntent;
  const highLocs = ctx.C.ner.locations.filter(l => l.score >= 0.90);
  
  if (intent === 'weather' && confidence >= 0.80 && highLocs.length === 1) {
    const city = highLocs[0].text;
    ctx.log.debug({ city, confidence }, 'fast_weather_hit');
    return { next: 'weather', slots: { city } };
  }
  
  return null;
}

// Route to domain based on intent
export async function routeToDomain(ctx: RuleContext): Promise<NodeOut | null> {
  const intent = ctx.forced || ctx.C.clsIntent?.intent || 'unknown';
  return { next: intent as any, slots: {} };
}

// Metrics helpers
export function incrementCounter(name: string, labels?: Record<string, string>) {
  // Placeholder for metrics - could integrate with existing metrics system
}
