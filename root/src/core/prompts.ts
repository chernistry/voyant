import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PromptName =
  | 'system'
  | 'blend'
  | 'blend_planner'
  | 'cot'
  | 'verify'
  | 'web_search_decider'
  | 'query_type_detector'
  | 'consent_detector'
  | 'context_switch_detector'
  | 'city_parser'
  | 'date_parser'
  | 'router_llm'
  | 'nlp_city_extraction'
  | 'nlp_clarifier'
  | 'nlp_intent_detection'
  | 'nlp_content_classification'
  | 'search_summarize'
  | 'search_query_optimizer'
  | 'search_extract_weather'
  | 'search_extract_country'
  | 'search_extract_attractions'
  | 'complexity_assessor'
  | 'iata_code_generator'
  | 'flight_complexity_detector'
  | 'policy_summarizer'
  | 'policy_classifier'
  | 'policy_quality_assessor'
  | 'search_result_extractor'
  | 'search_query_optimizer_llm'
  | 'preference_extractor'
  | 'attractions_kid_friendly'
  | 'city_name_extractor'
  | 'origin_destination_extractor'
  | 'attractions_summarizer'
  | 'country_disambiguator'
  | 'crawlee_page_summary'
  | 'crawlee_overall_summary'
  | 'destinations_recommender'
  | 'llm_test_evaluator'
  | 'entity_extraction_retry'
  | 'citation_analysis'
  | 'citation_verification';

let loaded = false;
const PROMPTS: Partial<Record<PromptName, string>> = {};
const memo = new Map<string, string>();

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
  PROMPTS.blend = await loadFileSafe(path.join(base, 'blend.md'));
  PROMPTS.blend_planner = await loadFileSafe(path.join(base, 'blend_planner.md'));
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
  PROMPTS.router_llm = await loadFileSafe(
    path.join(base, 'router_llm.md'),
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
  PROMPTS.iata_code_generator = await loadFileSafe(
    path.join(base, 'iata_code_generator.md'),
  );
  PROMPTS.complexity_assessor = await loadFileSafe(
    path.join(base, 'complexity_assessor.md'),
  );
  PROMPTS.flight_complexity_detector = await loadFileSafe(
    path.join(base, 'flight_complexity_detector.md'),
  );
  PROMPTS.policy_summarizer = await loadFileSafe(
    path.join(base, 'policy_summarizer.md'),
  );
  PROMPTS.policy_classifier = await loadFileSafe(
    path.join(base, 'policy_classifier.md'),
  );
  PROMPTS.policy_quality_assessor = await loadFileSafe(
    path.join(base, 'policy_quality_assessor.md'),
  );
  PROMPTS.search_result_extractor = await loadFileSafe(
    path.join(base, 'search_result_extractor.md'),
  );
  PROMPTS.search_query_optimizer_llm = await loadFileSafe(
    path.join(base, 'search_query_optimizer_llm.md'),
  );
  PROMPTS.preference_extractor = await loadFileSafe(
    path.join(base, 'preference_extractor.md'),
  );
  PROMPTS.attractions_kid_friendly = await loadFileSafe(
    path.join(base, 'attractions_kid_friendly.md'),
  );
  PROMPTS.city_name_extractor = await loadFileSafe(
    path.join(base, 'city_name_extractor.md'),
  );
  PROMPTS.origin_destination_extractor = await loadFileSafe(
    path.join(base, 'origin_destination_extractor.md'),
  );
  PROMPTS.attractions_summarizer = await loadFileSafe(
    path.join(base, 'attractions_summarizer.md'),
  );
  PROMPTS.country_disambiguator = await loadFileSafe(
    path.join(base, 'country_disambiguator.md'),
  );
  PROMPTS.crawlee_page_summary = await loadFileSafe(
    path.join(base, 'crawlee_page_summary.md'),
  );
  PROMPTS.crawlee_overall_summary = await loadFileSafe(
    path.join(base, 'crawlee_overall_summary.md'),
  );
  PROMPTS.destinations_recommender = await loadFileSafe(
    path.join(base, 'destinations_recommender.md'),
  );
  PROMPTS.llm_test_evaluator = await loadFileSafe(
    path.join(base, 'llm_test_evaluator.md'),
  );
  PROMPTS.entity_extraction_retry = await loadFileSafe(
    path.join(base, 'entity_extraction_retry.md'),
  );
  PROMPTS.citation_analysis = await loadFileSafe(
    path.join(base, 'citation_analysis.md'),
  );
  PROMPTS.citation_verification = await loadFileSafe(
    path.join(base, 'citation_verification.md'),
  );
  loaded = true;
}

export async function getPrompt(name: PromptName): Promise<string> {
  if (memo.has(name)) return memo.get(name)!;
  if (!loaded) await preloadPrompts();
  const text = PROMPTS[name] ?? '';
  memo.set(name, text);
  return text;
}
