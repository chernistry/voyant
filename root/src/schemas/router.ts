import { z } from 'zod';

export const Intent = z.enum(['destinations', 'packing', 'attractions', 'weather', 'unknown', 'web_search', 'system']);

export const RouterSlots = z.object({
  city: z.string().optional(),
  originCity: z.string().optional(),
  month: z.string().optional(),
  dates: z.string().optional(),
  travelerProfile: z.string().optional(),
  search_query: z.string().optional(),
});

export const RouterResult = z.object({
  intent: Intent,
  needExternal: z.boolean(),
  slots: RouterSlots,
  confidence: z.number().min(0).max(1),
});

export type RouterResultT = z.infer<typeof RouterResult>;