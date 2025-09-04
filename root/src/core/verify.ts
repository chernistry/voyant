import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type pino from 'pino';
import { callLLM } from './llm.js';

const VerifySchema = z.object({
  verdict: z.enum(['pass', 'warn', 'fail']),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()),
  revisedAnswer: z.string().optional(),
});
export type VerifyResult = z.infer<typeof VerifySchema>;

async function loadVerifyPrompt(): Promise<string> {
  const file = path.join(process.cwd(), 'src', 'prompts', 'verify.md');
  try {
    return await readFile(file, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Runs a second-pass verification in JSON mode.
 */
export async function verifyAnswer(input: {
  reply: string;
  facts: Array<{ key: string; value: unknown; source: string }>;
  log?: pino.Logger;
}): Promise<VerifyResult> {
  const system = await loadVerifyPrompt();
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


