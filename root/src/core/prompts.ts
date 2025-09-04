import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PromptName =
  | 'system'
  | 'router'
  | 'blend'
  | 'cot'
  | 'verify'
  | 'web_search_decider'
  | 'query_type_detector'
  | 'consent_detector'
  | 'city_parser'
  | 'date_parser'
  | 'intent_parser';

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
  PROMPTS.web_search_decider = await loadFileSafe(
    path.join(base, 'web_search_decider.md'),
  );
  PROMPTS.query_type_detector = await loadFileSafe(
    path.join(base, 'query_type_detector.md'),
  );
  PROMPTS.consent_detector = await loadFileSafe(
    path.join(base, 'consent_detector.md'),
  );
  PROMPTS.city_parser = await loadFileSafe(
    path.join(base, 'city_parser.md'),
  );
  PROMPTS.date_parser = await loadFileSafe(
    path.join(base, 'date_parser.md'),
  );
  PROMPTS.intent_parser = await loadFileSafe(
    path.join(base, 'intent_parser.md'),
  );
  loaded = true;
}

export async function getPrompt(name: PromptName): Promise<string> {
  if (!loaded) await preloadPrompts();
  return PROMPTS[name] ?? '';
}


