import { z } from 'zod';

export const ClauseType = z.enum(['baggage', 'refund', 'change', 'visa']);

export const PolicyReceiptSchema = z.object({
  url: z.string().url(),
  title: z.string().min(3),
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
  capturedAt: z.string().datetime(),
  quote: z.string().max(2000), // Remove min length requirement
  imgPath: z.string().optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['airline', 'hotel', 'visa', 'generic'])
});

export type PolicyReceipt = z.infer<typeof PolicyReceiptSchema>;
export type ClauseTypeT = z.infer<typeof ClauseType>;
