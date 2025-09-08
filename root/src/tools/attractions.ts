import { searchTravelInfo, extractAttractionsFromResults, llmExtractAttractionsFromResults } from './brave_search.js';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchPOIs, getPOIDetail } from './opentripmap.js';
import { classifyAttractions, type AttractionItem } from '../core/nlp-attractions-classifier.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string; source?: string };

export async function getAttractions(input: {
  city?: string;
  limit?: number;
  profile?: 'default' | 'kid_friendly';
}): Promise<Out> {
  if (!input.city) return { ok: false, reason: 'no_city' };
  
  // Check for obviously fake city names in the original input
  const city = input.city.toLowerCase();
  if (city.includes('fake') || city.includes('test') || city.includes('cityville') || 
      city.includes('ville') && city.length < 15 || city.length <= 2) {
    return { ok: false, reason: 'unknown_city' };
  }
  
  // Try OpenTripMap first for richer POI data
  const primaryResult = await tryOpenTripMap(input.city, input.limit, input.profile);
  if (primaryResult.ok) {
    return primaryResult;
  }

  // For unknown cities, avoid web fallback to prevent fabrications
  if (!primaryResult.ok && primaryResult.reason === 'unknown_city') {
    return primaryResult;
  }

  // Fallback to Brave Search
  const fallbackResult = await tryAttractionsFallback(input.city);
  if (fallbackResult.ok) {
    return { ...fallbackResult, source: 'brave-search' };
  }

  return primaryResult; // Return original error
}

async function tryOpenTripMap(city: string, limit = 7, profile: 'default' | 'kid_friendly' = 'default'): Promise<Out> {
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
    
    // Use broader kinds for better NLP classification
    const baseKinds = 'museums,monuments,historic,cultural,interesting_places,tourist_facilities,urban_environment,natural,amusements';
    let pois = await searchPOIs({ 
      lat: first.latitude, 
      lon: first.longitude, 
      limit: limit + 3, // Get more for better filtering
      kinds: baseKinds
    });
    
    if (pois.ok && pois.pois.length >= 2) {
      // Get detailed descriptions for NLP classification
      const top = pois.pois.slice(0, Math.max(5, Math.min(limit + 2, 8)));
      const attractions: AttractionItem[] = [];
      
      for (const p of top) {
        const d = await getPOIDetail(p.xid);
        const name = (d.ok ? d.detail.name : null) || p.name || '';
        const description = d.ok ? (d.detail.description || '').replace(/\s+/g, ' ').trim() : '';
        
        if (name && name.length >= 3) {
          // Filter out obvious non-attractions
          const lower = name.toLowerCase();
          if (!/restaurant|cafe|pizzeria|bar|grill|fountain|erg|320\s*gradi|tōkaidō|road|street|avenue/i.test(lower)) {
            attractions.push({ name, description });
          }
        }
      }
      
      if (attractions.length >= 1) {
        // Use NLP classification instead of hardcoded regex
        const classified = await classifyAttractions(attractions, profile);
        
        if (classified.length >= 1) {
          const summary = classified
            .slice(0, limit)
            .map(a => a.description ? `${a.name}: ${a.description.substring(0, 150)}${a.description.length > 150 ? '...' : ''}` : a.name)
            .join('; ');
          return { ok: true, summary, source: 'opentripmap' };
        }
      }
      
      // Fallback to names only if detailed descriptions don't work
      if (attractions.length >= 2) {
        const classified = await classifyAttractions(attractions, profile);
        if (classified.length >= 2) {
          const summary = classified.slice(0, limit).map(a => a.name).join('; ');
          return { ok: true, summary, source: 'opentripmap' };
        }
      }
    }
    
    // Second pass with city center radius if first pass yielded insufficient results
    if (pois.ok && pois.pois.length < 3) {
      const poisRadius = await searchPOIs({ 
        lat: first.latitude, 
        lon: first.longitude, 
        limit: limit + 2,
        kinds: 'interesting_places,tourist_facilities,architecture,urban_environment,natural,museums,monuments,historic,cultural,amusements',
        radiusMeters: 5000 // 5km radius
      });
      
      if (poisRadius.ok && poisRadius.pois.length > 0) {
        const attractions: AttractionItem[] = poisRadius.pois
          .slice(0, Math.max(3, Math.min(limit, 6)))
          .map(p => ({ name: (p.name || '').trim(), description: '' }))
          .filter(a => a.name.length >= 5)
          .filter(a => {
            const lower = a.name.toLowerCase();
            return !/restaurant|cafe|pizzeria|bar|grill|fountain|erg|320\s*gradi|tōkaidō|road|street|avenue/i.test(lower);
          });
          
        if (attractions.length > 0) {
          const classified = await classifyAttractions(attractions, profile);
          if (classified.length > 0) {
            const summary = classified.map(a => a.name).join('; ');
            return { ok: true, summary, source: 'opentripmap' };
          }
        }
      }
    }
    
    if (pois.ok) {
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
