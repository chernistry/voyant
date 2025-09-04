import { searchTravelInfo, extractAttractionsFromResults } from '../tools/brave_search.js';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string };

export async function getAttractions(input: {
  city?: string;
  limit?: number;
}): Promise<Out> {
  if (!input.city) return { ok: false, reason: 'no_city' };
  
  // Try primary Wikipedia API first
  const primaryResult = await tryPrimaryAttractionsAPI(input.city, input.limit);
  if (primaryResult.ok) {
    return primaryResult;
  }

  // Fallback to Brave Search
  const fallbackResult = await tryAttractionsFallback(input.city);
  if (fallbackResult.ok) {
    return { 
      ...fallbackResult, 
      summary: `The attractions service is currently unavailable, but here are some web search results: ${fallbackResult.summary}`,
      source: 'brave-search' 
    };
  }

  return primaryResult; // Return original error
}

async function tryPrimaryAttractionsAPI(city: string, limit = 5): Promise<Out> {
  try {
    const response = await fetchJSON<{ extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`);
    if (response.extract) {
      return { ok: true, summary: response.extract, source: 'wikipedia' };
    }
    return { ok: false, reason: 'no_data' };
  } catch (error) {
    return { ok: false, reason: 'api_error' };
  }
}

async function tryAttractionsFallback(city: string): Promise<Out> {
  try {
    const searchResult = await searchTravelInfo(`${city} attractions tourist places`);
    if (!searchResult.ok) {
      return { ok: false, reason: 'fallback_failed' };
    }
    const attractions = extractAttractionsFromResults(searchResult.results, city);
    if (attractions) {
      return { ok: true, summary: attractions };
    }
    return { ok: false, reason: 'no_fallback_data' };
  } catch (error) {
    return { ok: false, reason: 'fallback_error' };
  }
}
