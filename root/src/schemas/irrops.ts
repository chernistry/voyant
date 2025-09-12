import { z } from 'zod';

export const PNRSchema = z.object({
  recordLocator: z.string().min(6),
  passengers: z.array(z.object({
    name: z.string(),
    type: z.enum(['ADT', 'CHD', 'INF'])
  })),
  segments: z.array(z.object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departure: z.string().datetime(),
    arrival: z.string().datetime(),
    carrier: z.string().length(2),
    flightNumber: z.string(),
    cabin: z.enum(['Y', 'W', 'J', 'F']),
    status: z.enum(['OK', 'HK', 'XX', 'UN'])
  }))
});

export const DisruptionEventSchema = z.object({
  type: z.enum(['cancellation', 'delay', 'equipment_change', 'user_request']),
  affectedSegments: z.array(z.number().int().min(0)),
  timestamp: z.string().datetime(),
  reason: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high']).default('medium')
});

export const IrropsOptionSchema = z.object({
  id: z.string(),
  type: z.enum(['keep_partial', 'full_reroute', 'hold_aside']),
  segments: z.array(PNRSchema.shape.segments.element),
  priceChange: z.object({
    amount: z.number(),
    currency: z.string().length(3)
  }),
  rulesApplied: z.array(z.string()),
  citations: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const UserPreferencesSchema = z.object({
  maxPriceIncrease: z.number().optional(),
  preferredCarriers: z.array(z.string()).optional(),
  minConnectionTime: z.number().int().min(30).optional()
});

export const IrropsProcessingSchema = z.object({
  recordLocator: z.string().min(6),
  disruptionType: z.enum(['cancellation', 'delay', 'equipment_change', 'user_request']),
  affectedSegments: z.array(z.number().int().min(0)),
  preferences: UserPreferencesSchema.optional()
});

export type PNR = z.infer<typeof PNRSchema>;
export type DisruptionEvent = z.infer<typeof DisruptionEventSchema>;
export type IrropsOption = z.infer<typeof IrropsOptionSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type IrropsProcessing = z.infer<typeof IrropsProcessingSchema>;
