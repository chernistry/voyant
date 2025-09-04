import { searchTravelInfo, extractAttractionsFromResults } from './brave_search.js';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchPOIs } from './opentripmap.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string };

export async function getAttractions(input: {
  city?: string;
  limit?: number;
}): Promise<Out> {
  if (!input.city) return { ok: false, reason: 'no_city' };
  
  // Try OpenTripMap first for richer POI data
  const primaryResult = await tryOpenTripMap(input.city, input.limit);
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

async function tryOpenTripMap(city: string, limit = 5): Promise<Out> {
  // Resolve city to coordinates via Open-Meteo Geocoding API
  type GeoItem = {
    name?: string;
    latitude?: number;
    longitude?: number;
  };
  type GeoResp = { results?: GeoItem[] };
  try {
    const g = await fetchJSON<GeoResp>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1&language=en&format=json`,
      { timeoutMs: 4000, retries: 2, target: 'open-meteo:geocode' },
    );
    const first = (g.results ?? [])[0];
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
      return { ok: false, reason: 'unknown_city' };
    }
    const pois = await searchPOIs({ lat: first.latitude, lon: first.longitude, limit });
    if (pois.ok) {
      const names = pois.pois
        .map((p) => p.name)
        .filter((s) => s && s.trim().length > 0)
        .slice(0, limit);
      if (names.length > 0) {
        return { ok: true, summary: names.join(', '), source: 'opentripmap' };
      }
      return { ok: false, reason: 'no_pois' };
    }
    return { ok: false, reason: pois.reason };
  } catch (e) {
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : 'network' };
    }
    return { ok: false, reason: 'network' };
  }
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


