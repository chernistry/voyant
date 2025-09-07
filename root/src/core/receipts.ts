import { z } from 'zod';

/**
 * Zod schemas and helpers for the Receipts feature.
 * Provides typed structures for facts collected from external tools,
 * and a compact receipts card that includes sources, decisions,
 * self-check result and budget estimates.
 */

export const FactSchema = z.object({
  source: z
    .enum(['Open-Meteo', 'REST Countries', 'OpenTripMap', 'Brave Search', 'Vectara'])
    .or(z.string()),
  key: z.string(),
  value: z.any(),
  url: z.string().optional(),
  latency_ms: z.number().optional(),
});

export const ReceiptsSchema = z.object({
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
});

export type Fact = z.infer<typeof FactSchema>;
export type Receipts = z.infer<typeof ReceiptsSchema>;

export function buildReceiptsSkeleton(
  facts: Fact[],
  decisions: string[],
  token_estimate?: number,
): Receipts {
  const sources = Array.from(new Set(facts.map((f) => f.source)));
  const ext_api_latency_ms = facts.reduce(
    (sum, f) => sum + (typeof f.latency_ms === 'number' ? f.latency_ms : 0),
    0,
  );
  return {
    sources,
    decisions,
    selfCheck: { verdict: 'warn', notes: ['self-check not run'] },
    budgets: { ext_api_latency_ms, token_estimate },
  };
}


