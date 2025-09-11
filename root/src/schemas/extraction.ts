import { z } from 'zod';

export const EntityWithConfidence = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1)
});

export const ExtractionResult = z.object({
  cities: z.array(EntityWithConfidence),
  overallConfidence: z.number().min(0).max(1)
});

export type EntityWithConfidenceT = z.infer<typeof EntityWithConfidence>;
export type ExtractionResultT = z.infer<typeof ExtractionResult>;
