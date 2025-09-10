import { getCountryFacts } from './country.js';
import { extractTravelPreferences } from '../core/preference-extractor.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';
import type pino from 'pino';

export interface DestinationFact {
  source: string;
  key: string;
  value: {
    city: string;
    country: string;
    tags: {
      climate: string;
      budget: string;
      family_friendly: boolean;
    };
  };
  url?: string;
}

export interface Slots {
  city?: string;
  month?: string;
  dates?: string;
  travelerProfile?: string;
  budget?: string;
  climate?: string;
}

export async function recommendDestinations(
  slots: Slots, 
  log?: pino.Logger
): Promise<DestinationFact[]> {
  try {
    const preferences = await extractTravelPreferences(slots.travelerProfile || '', log);

    const tpl = await getPrompt('destinations_recommender');
    const prompt = tpl
      .replace('{preferences}', JSON.stringify(preferences))
      .replace('{slots}', JSON.stringify(slots));

    const rawResponse = await callLLM(prompt, { responseFormat: 'json', log });
    const recommendations = JSON.parse(rawResponse);

    // Format the LLM response into the DestinationFact structure
    return recommendations.map((rec: any) => ({
      source: 'LLM Recommendation',
      key: 'destination',
      value: {
        city: rec.city,
        country: rec.country,
        tags: rec.tags
      },
      url: `Generated recommendation for ${rec.city}`
    }));

  } catch (e) {
    if (log) log.error({ error: e }, 'Failed to get AI-driven destinations');
    return [];
  }
}