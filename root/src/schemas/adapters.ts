import { z } from 'zod';

export const DestinationQuery = z.object({
  city: z.string(),
  month: z.string().optional(),
  dates: z.string().optional(),
});

export const PackingContext = z.object({
  city: z.string(),
  dates: z.string().optional(),
  month: z.string().optional(),
  travelerProfile: z.string().optional(),
});

export const AttractionQuery = z.object({
  city: z.string(),
  limit: z.number().int().min(1).max(10).default(5),
});


