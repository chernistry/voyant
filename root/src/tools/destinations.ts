import { getCountryFacts } from './country.js';
import { extractTravelPreferences } from '../core/preference-extractor.js';
import { callLLM } from '../core/llm.js';
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

    const prompt = `
      Based on the following travel preferences, recommend 3-4 destinations.
      Preferences: ${JSON.stringify(preferences)}
      User query context: ${JSON.stringify(slots)}

      For each destination, provide a brief, compelling reason why it matches the preferences.
      Return the recommendations in a JSON array with the following structure:
      [
        {
          "city": "City Name",
          "country": "Country Name",
          "description": "Why this destination is a good fit.",
          "tags": {
            "climate": "e.g., warm, cold, temperate",
            "budget": "e.g., low, mid, high",
            "family_friendly": true/false
          }
        }
      ]
    `;

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