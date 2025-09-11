import { z } from 'zod';
import type pino from 'pino';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';

const VerifySchema = z.object({
  verdict: z.enum(['pass', 'warn', 'fail']),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()),
  revisedAnswer: z.string().optional(),
});
export type VerifyResult = z.infer<typeof VerifySchema>;

export async function verifyAnswer(input: {
  reply: string;
  facts: Array<{ key: string; value: unknown; source: string }>;
  log?: pino.Logger;
}): Promise<VerifyResult> {
  const system = await getPrompt('verify');
  const payload = `${system}\n\nReturn STRICT JSON only.\n\nUser request: ${JSON.stringify({ reply: input.reply, facts: input.facts })}`;
  const raw = await callLLM(payload, { responseFormat: 'json', log: input.log });
  // Try parsing an embedded JSON object if model returned extra text
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  }
  return VerifySchema.parse(parsed);
}


