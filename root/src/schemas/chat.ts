import { z } from 'zod';

export const ChatInput = z.object({
  message: z.string().min(1).max(2000),
  threadId: z.string().min(1).max(64).optional(),
  receipts: z.boolean().optional(),
});
export type ChatInputT = z.infer<typeof ChatInput>;

export const ChatOutput = z.object({
  reply: z.string().min(1),
  threadId: z.string().min(1).max(64),
  citations: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  receipts: z
    .object({
      sources: z.array(z.string()),
      decisions: z.array(z.string()),
      selfCheck: z.object({
        verdict: z.enum(['pass', 'warn', 'fail']),
        notes: z.array(z.string()),
      }),
      budgets: z.object({
        ext_api_latency_ms: z.number().optional(),
        token_estimate: z.number().optional(),
      }),
    })
    .optional(),
});
export type ChatOutputT = z.infer<typeof ChatOutput>;


