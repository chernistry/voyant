import {
  searchTravelInfo,
  llmExtractAttractionsFromResults,
  getSearchSource,
} from './search.js';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchPOIs, getPOIDetail } from './opentripmap.js';
import { classifyAttractions, type AttractionItem } from '../core/transformers-attractions-classifier.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';

type Out = { ok: true; summary: string; source?: string; reason?: string } | { ok: false; reason: string; source?: string };

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
  if (!primaryResult.ok && 'reason' in primaryResult && primaryResult.reason === 'unknown_city') {
    return primaryResult;
  }

  // Fallback to web search
  const fallbackResult = await tryAttractionsFallback(input.city);
  if (fallbackResult.ok) {
    return { ...fallbackResult, source: getSearchSource() };
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
    
    // Use broader kinds for better NLP classification (only valid OpenTripMap categories)
    const baseKinds = [
      'museums','cultural','historic','architecture','monuments','castles','palaces',
      'amusements','bridges','towers','lighthouses','fortifications','natural','other','interesting_places'
    ];
    const kidKinds = baseKinds.concat(['zoos', 'aquariums', 'theme_parks', 'playgrounds']);

    const kinds = (profile === 'kid_friendly' ? kidKinds : baseKinds)
      .filter(k => !['restaurants','eateries','bars','cafes'].includes(k))
      .join(',');

    let pois = await searchPOIs({ 
      lat: first.latitude, 
      lon: first.longitude, 
      limit: limit + 3, // Get more for better filtering
      kinds
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
        
        // For default profile, return all attractions; for kid_friendly, return filtered
        const finalAttractions = profile === 'default' ? attractions : classified;
        
        if (finalAttractions.length >= 1) {
          const summary = await summarizeAttractions(finalAttractions.slice(0, limit), city, profile);
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
        kinds: (profile === 'kid_friendly' ? kidKinds : baseKinds)
          .filter(k => !['restaurants','eateries','bars','cafes'].includes(k))
          .join(','),
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
          const finalAttractions = profile === 'default' ? attractions : classified;
          
          if (finalAttractions.length > 0) {
            const summary = await summarizeAttractions(finalAttractions, city, profile);
            return { ok: true, summary, source: 'opentripmap' };
          }
        }
      }
    }
    
    if (pois.ok) {
      return { ok: false, reason: 'no_pois', source: 'opentripmap' };
    }
    return { ok: false, reason: 'reason' in pois ? pois.reason : 'unknown_error', source: pois.source || 'opentripmap' };
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
    return { ok: false, reason: 'fallback_failed', source: getSearchSource() };
  }

  // LLM-first extraction
  const attractionsInfoLLM = await llmExtractAttractionsFromResults(searchResult.results, city);
  if (attractionsInfoLLM) {
    return { ok: true, summary: attractionsInfoLLM, source: getSearchSource() };
  }

  return { ok: false, reason: 'no_attractions_data', source: getSearchSource() };
}

/**
 * Summarize attractions using LLM for coherent output
 */
async function summarizeAttractions(
  attractions: AttractionItem[], 
  city: string, 
  profile: 'default' | 'kid_friendly' = 'default'
): Promise<string> {
  try {
    const attractionData = attractions.map(a => ({
      name: a.name,
      description: a.description || 'No description available'
    }));

    const profileContext = profile === 'kid_friendly' 
      ? 'Focus on family-friendly and child-appropriate attractions.'
      : 'Include all types of attractions for general travelers.';

    const tpl = await getPrompt('attractions_summarizer');
    const prompt = tpl
      .replace('{city}', city)
      .replace('{profileContext}', profileContext)
      .replace(
        '{attractions}',
        attractionData
          .map(a => `- ${a.name}: ${a.description.slice(0, 200)}`)
          .join('\n'),
      );

    const response = await callLLM(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(response);
    
    if (parsed.summary && typeof parsed.summary === 'string') {
      return parsed.summary;
    }
    
    // Fallback to simple list if LLM fails
    return `Popular attractions in ${city} include: ${attractions.map(a => a.name).join(', ')}`;
    
  } catch (error) {
    // Fallback to simple list if LLM fails
    return `Popular attractions in ${city} include: ${attractions.map(a => a.name).join(', ')}`;
  }
}
