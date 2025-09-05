import { searchTravelInfo, extractAttractionsFromResults, llmExtractAttractionsFromResults } from './brave_search.js';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchPOIs, getPOIDetail } from './opentripmap.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string; source?: string };

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
    const pois = await searchPOIs({ 
      lat: first.latitude, 
      lon: first.longitude, 
      limit,
      kinds: 'museums,monuments,historic,cultural'
    });
    if (pois.ok) {
      // Try to enrich with short descriptions using POI detail endpoint
      const top = pois.pois.slice(0, Math.max(1, Math.min(limit, 5)));
      const details = await Promise.all(
        top.map(async (p) => {
          const d = await getPOIDetail(p.xid);
          if (d.ok) {
            const name = d.detail.name || p.name || '';
            const desc = (d.detail.description || '').replace(/\s+/g, ' ').trim();
            if (name && desc) return `${name}: ${desc}`;
            if (name) return name;
          }
          const fallback = (p.name || '').trim();
          return fallback;
        })
      );
      const items = details.filter(Boolean).map(String);
      if (items.length > 0) {
        return { ok: true, summary: items.join('; '), source: 'opentripmap' };
      }
      return { ok: false, reason: 'no_pois', source: 'opentripmap' };
    }
    return { ok: false, reason: pois.reason, source: pois.source || 'opentripmap' };
  } catch (e) {
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : 'network', source: 'opentripmap' };
    }
    return { ok: false, reason: 'network', source: 'opentripmap' };
  }
}

async function tryAttractionsFallback(city: string): Promise<Out> {
  const query = `top attractions in ${city} things to do visit`;

  const searchResult = await searchTravelInfo(query);
  if (!searchResult.ok) {
    return { ok: false, reason: 'fallback_failed', source: 'brave-search' };
  }

  // LLM-first extraction
  const attractionsInfoLLM = await llmExtractAttractionsFromResults(searchResult.results, city);
  if (attractionsInfoLLM) {
    return { ok: true, summary: attractionsInfoLLM, source: 'brave-search' };
  }

  // Heuristic fallback
  const attractionsInfo = extractAttractionsFromResults(searchResult.results, city);
  if (attractionsInfo) {
    return { ok: true, summary: attractionsInfo, source: 'brave-search' };
  }

  return { ok: false, reason: 'no_attractions_data', source: 'brave-search' };
}

