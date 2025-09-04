import { searchTravelInfo, extractAttractionsFromResults } from './brave_search.js';
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
    return { ...fallbackResult, source: 'brave-search' };
  }

  return primaryResult; // Return original error
}

async function tryPrimaryAttractionsAPI(city: string, limit = 5): Promise<Out> {
  // Try multiple search strategies for better results
  const searchTerms = [
    `${city} attractions`,
    `${city} tourist attractions`,
    `${city} landmarks`,
    `things to do in ${city}`
  ];
  
  for (const searchTerm of searchTerms) {
    const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(searchTerm)}&limit=${limit}`;
    
    try {
      const searchResult = await fetchJSON<{ pages?: { title: string }[] }>(searchUrl, {
        timeoutMs: 6000,
        retries: 1,
        target: 'wikipedia',
        headers: {
          'User-Agent': 'Voyant-Travel-Assistant/1.0',
          'Accept': 'application/json'
        }
      });
      
      const pages = searchResult?.pages || [];
      
      if (pages.length > 0) {
        const titles = pages.slice(0, limit).map(p => p.title);
        const summary = titles.join(', ');
        return { ok: true, summary, source: 'wikipedia' };
      }
    } catch (e) {
      if (e instanceof ExternalFetchError && e.status && e.status >= 500) {
        continue; // Try next search term on 5xx errors
      }
      // For other errors (4xx, network, timeout), continue to next search term
      continue;
    }
  }
  
  // If all searches failed, return a more specific error
  return { ok: false, reason: 'no_pois' };
}

async function tryAttractionsFallback(city: string): Promise<Out> {
  const query = `top attractions in ${city} things to do visit`;
  
  const searchResult = await searchTravelInfo(query);
  if (!searchResult.ok) {
    return { ok: false, reason: 'fallback_failed' };
  }

  const attractionsInfo = extractAttractionsFromResults(searchResult.results, city);
  if (attractionsInfo) {
    return { ok: true, summary: attractionsInfo };
  }

  return { ok: false, reason: 'no_attractions_data' };
}


