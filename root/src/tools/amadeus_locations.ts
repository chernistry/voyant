import { getAmadeusClient } from '../vendors/amadeus_client.js';
import { withPolicies } from './_sdk_policies.js';
import { toStdError } from './errors.js';

export type SearchOpts = {
  keyword: string; 
  subType: 'CITY'|'AIRPORT'|'CITY,AIRPORT'; 
  countryCode?: string; 
  view?: 'LIGHT'|'FULL'; 
  limit?: number;
};

export type ResolveCityOut = {
  ok: true; 
  cityCode: string; 
  cityName: string; 
  confidence: number; 
  source: 'amadeus';
  geo?: { latitude: number; longitude: number }; 
  candidates: Array<{ cityCode: string; cityName: string; confidence: number }>;
} | { 
  ok: false; 
  reason: 'not_found'|'ambiguous'|'timeout'|'http_4xx'|'http_5xx'|'network' 
};

export type Airport = { 
  iataCode: string; 
  name?: string; 
  cityCode: string; 
  score?: number; 
  latitude?: number; 
  longitude?: number 
};

/**
 * Search locations using Amadeus SDK with pagination support.
 */
export async function searchLocations(
  opts: SearchOpts, 
  signal?: AbortSignal
): Promise<any[]> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const params = {
        keyword: opts.keyword,
        subType: opts.subType,
        view: opts.view ?? 'FULL',
        page: { limit: opts.limit ?? 20 },
        ...(opts.countryCode && { countryCode: opts.countryCode }),
      };
      
      const response = await amadeus.referenceData.locations.get(params);
      let results = response.data || [];
      
      // Paginate up to 2 pages
      if (response.meta?.links?.next && results.length < 40) {
        try {
          const nextResponse = await amadeus.next(response);
          results = results.concat(nextResponse.data || []);
        } catch (e) {
          // Ignore pagination errors
        }
      }
      
      return results;
    }, signal, 4000);
  } catch (error) {
    const stdError = toStdError(error, 'searchLocations');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Resolve city with confidence scoring using Jaro-Winkler similarity.
 */
export async function resolveCity(
  input: string, 
  countryHint?: string
): Promise<ResolveCityOut> {
  try {
    const results = await searchLocations({
      keyword: input,
      subType: 'CITY',
      countryCode: countryHint,
      view: 'FULL',
      limit: 10,
    });
    
    if (!results.length) {
      return { ok: false, reason: 'not_found' };
    }
    
    const candidates = results
      .filter(loc => loc.subType === 'CITY' && loc.iataCode)
      .map(loc => ({
        cityCode: loc.iataCode,
        cityName: loc.name,
        confidence: jaroWinkler(input.toLowerCase(), loc.name.toLowerCase()),
      }))
      .sort((a, b) => b.confidence - a.confidence);
    
    if (!candidates.length) {
      return { ok: false, reason: 'not_found' };
    }
    
    const best = candidates[0]!;
    const bestResult = results.find(r => r.iataCode === best.cityCode);
    
    return {
      ok: true,
      cityCode: best.cityCode,
      cityName: best.cityName,
      confidence: Math.round(best.confidence * 100) / 100,
      source: 'amadeus',
      geo: bestResult?.geoCode ? {
        latitude: bestResult.geoCode.latitude,
        longitude: bestResult.geoCode.longitude,
      } : undefined,
      candidates: candidates.slice(0, 3),
    };
  } catch (error) {
    const stdError = toStdError(error, 'resolveCity');
    return { 
      ok: false, 
      reason: stdError.code.includes('timeout') ? 'timeout' : 'network' 
    };
  }
}

/**
 * Get airports for a city code.
 */
export async function airportsForCity(
  cityCode: string, 
  signal?: AbortSignal
): Promise<Airport[]> {
  try {
    const results = await searchLocations({
      keyword: cityCode,
      subType: 'AIRPORT',
      limit: 20,
    }, signal);
    
    return results
      .filter(loc => 
        loc.subType === 'AIRPORT' && 
        loc.address?.cityCode === cityCode
      )
      .map(loc => ({
        iataCode: loc.iataCode,
        name: loc.name,
        cityCode: loc.address?.cityCode || cityCode,
        score: loc.analytics?.travelers?.score,
        latitude: loc.geoCode?.latitude,
        longitude: loc.geoCode?.longitude,
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  } catch (error) {
    const stdError = toStdError(error, 'airportsForCity');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

// Simple Jaro-Winkler implementation
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / len1 + matches / len2 + 
    (matches - transpositions / 2) / matches) / 3;
  
  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(len1, len2, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + (0.1 * prefix * (1 - jaro));
}
