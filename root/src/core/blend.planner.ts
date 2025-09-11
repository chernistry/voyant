import { getPrompt } from './prompts.js';
import { callLLM } from './llm.js';

export type BlendPlan = {
  explicit_search: boolean;
  unrelated: boolean;
  system_question: boolean;
  mixed_languages: boolean;
  query_facets: { wants_restaurants: boolean; wants_budget: boolean; wants_flights: boolean; };
  needs_web: boolean;
  needs_weather: boolean;
  needs_attractions: boolean;
  needs_country_facts: boolean;
  style: 'bullet'|'short'|'narrative';
  summarize_web_with_llm: boolean;
  missing_slots: string[];
  safety: { disallowed_topic: boolean; reason: string };
};

export async function planBlend(message: string, route: any, log: any): Promise<BlendPlan> {
  const tpl = await getPrompt('blend_planner');
  const prompt = tpl
    .replace('{message}', message.replace(/\n/g, ' '))
    .replace('{intent}', route.intent)
    .replace('{slots}', JSON.stringify(route.slots));
  const raw = await callLLM(prompt, { responseFormat: 'json', log });
  return JSON.parse(raw) as BlendPlan;
}
