import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PromptName = 'system' | 'router' | 'blend' | 'cot' | 'verify';

let loaded = false;
const PROMPTS: Partial<Record<PromptName, string>> = {};

async function loadFileSafe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export async function preloadPrompts(): Promise<void> {
  if (loaded) return;
  const base = path.join(process.cwd(), 'src', 'prompts');
  PROMPTS.system = await loadFileSafe(path.join(base, 'system.md'));
  PROMPTS.router = await loadFileSafe(path.join(base, 'router.md'));
  PROMPTS.blend = await loadFileSafe(path.join(base, 'blend.md'));
  PROMPTS.cot = await loadFileSafe(path.join(base, 'cot.md'));
  PROMPTS.verify = await loadFileSafe(path.join(base, 'verify.md'));
  loaded = true;
}

export async function getPrompt(name: PromptName): Promise<string> {
  if (!loaded) await preloadPrompts();
  return PROMPTS[name] ?? '';
}


