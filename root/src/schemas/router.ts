import { z } from 'zod';

export const Intent = z.enum(['destinations', 'packing', 'attractions', 'weather', 'policy', 'flights', 'irrops', 'unknown', 'web_search', 'system']);

export const RouterSlots = z.object({
  city: z.string().optional(),
  originCity: z.string().optional(),
  destinationCity: z.string().optional(),
  month: z.string().optional(),
  dates: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  passengers: z.string().optional(),
  cabinClass: z.string().optional(),
  travelerProfile: z.string().optional(),
  search_query: z.string().optional(),
  // IRROPS-specific slots
  recordLocator: z.string().optional(),
  disruptionType: z.string().optional(),
  affectedSegments: z.string().optional(),
  maxPriceIncrease: z.string().optional(),
  preferredCarriers: z.string().optional(),
  minConnectionTime: z.string().optional(),
  // Deep research consent flow (optional)
  awaiting_deep_research_consent: z.string().optional(),
  pending_deep_research_query: z.string().optional(),
  complexity_reasoning: z.string().optional(),
  deep_research_consent_needed: z.string().optional(),
  complexity_score: z.string().optional(),
  // Flight clarification flow (optional)
  flight_clarification_needed: z.string().optional(),
  ambiguity_reason: z.string().optional(),
  clarification_options: z.string().optional(),
  awaiting_flight_clarification: z.string().optional(),
  pending_flight_query: z.string().optional(),
  clarification_reasoning: z.string().optional(),
});

export const RouterResult = z.object({
  intent: Intent,
  needExternal: z.boolean(),
  slots: RouterSlots,
  confidence: z.number().min(0).max(1),
});

export type RouterResultT = z.infer<typeof RouterResult>;
