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
  | 'context_switch_detector'
  | 'city_parser'
  | 'date_parser'
  | 'intent_parser'
  | 'router_llm'
  | 'router_fallback'
  | 'nlp_city_extraction'
  | 'nlp_clarifier'
  | 'nlp_intent_detection'
  | 'nlp_content_classification'
  | 'search_summarize'
  | 'search_query_optimizer'
  | 'search_extract_weather'
  | 'search_extract_country'
  | 'search_extract_attractions'
  | 'complexity_assessor';

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
  PROMPTS.router_llm = await loadFileSafe(
    path.join(base, 'router_llm.md'),
  );
  PROMPTS.router_fallback = await loadFileSafe(
    path.join(base, 'router_fallback.md'),
  );
  PROMPTS.nlp_city_extraction = await loadFileSafe(
    path.join(base, 'nlp_city_extraction.md'),
  );
  PROMPTS.nlp_clarifier = await loadFileSafe(
    path.join(base, 'nlp_clarifier.md'),
  );
  PROMPTS.nlp_intent_detection = await loadFileSafe(
    path.join(base, 'nlp_intent_detection.md'),
  );
  PROMPTS.nlp_content_classification = await loadFileSafe(
    path.join(base, 'nlp_content_classification.md'),
  );
  PROMPTS.search_summarize = await loadFileSafe(
    path.join(base, 'search_summarize.md'),
  );
  PROMPTS.search_query_optimizer = await loadFileSafe(
    path.join(base, 'search_query_optimizer.md'),
  );
  PROMPTS.search_extract_weather = await loadFileSafe(
    path.join(base, 'search_extract_weather.md'),
  );
  PROMPTS.search_extract_country = await loadFileSafe(
    path.join(base, 'search_extract_country.md'),
  );
  PROMPTS.search_extract_attractions = await loadFileSafe(
    path.join(base, 'search_extract_attractions.md'),
  );
  PROMPTS.complexity_assessor = await loadFileSafe(
    path.join(base, 'complexity_assessor.md'),
  );
  loaded = true;
}

export async function getPrompt(name: PromptName): Promise<string> {
  if (!loaded) await preloadPrompts();
  return PROMPTS[name] ?? '';
}
