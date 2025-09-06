import { z } from 'zod';

export const Intent = z.enum(['destinations', 'packing', 'attractions', 'weather', 'policy', 'unknown', 'web_search', 'system']);

export const RouterSlots = z.object({
  city: z.string().optional(),
  originCity: z.string().optional(),
  month: z.string().optional(),
  dates: z.string().optional(),
  travelerProfile: z.string().optional(),
  search_query: z.string().optional(),
  // Deep research consent flow (optional)
  awaiting_deep_research_consent: z.string().optional(),
  pending_deep_research_query: z.string().optional(),
  complexity_reasoning: z.string().optional(),
  deep_research_consent_needed: z.string().optional(),
  complexity_score: z.string().optional(),
});

export const RouterResult = z.object({
  intent: Intent,
  needExternal: z.boolean(),
  slots: RouterSlots,
  confidence: z.number().min(0).max(1),
});

export type RouterResultT = z.infer<typeof RouterResult>;
