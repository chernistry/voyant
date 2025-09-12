import { fetchJSON } from '../util/fetch.js';
import { getAmadeusToken } from './amadeus_auth.js';
import { AmadeusLocationList, TLocation } from '../schemas/amadeus.js';

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
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  
  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(len1, len2, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + (0.1 * prefix * (1 - jaro));
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// In-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttlMs = 600000): void { // 10 min
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

export async function searchLocations(opts: SearchOpts, signal?: AbortSignal): Promise<TLocation[]> {
  const cacheKey = `${opts.keyword}:${opts.subType}:${opts.countryCode || ''}`;
  const cached = getCached<TLocation[]>(cacheKey);
  if (cached) return cached;

  const token = await getAmadeusToken(signal);
  const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
  
  const params = new URLSearchParams({
    keyword: opts.keyword,
    subType: opts.subType,
    view: opts.view || 'FULL',
    'page[limit]': (opts.limit || 20).toString(),
  });
  
  if (opts.countryCode) {
    params.append('countryCode', opts.countryCode);
  }

  const response = await fetchJSON<typeof AmadeusLocationList._type>(
    `${baseUrl}/v1/reference-data/locations?${params.toString()}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
      timeoutMs: 4000,
      retries: 3,
      target: 'amadeus:locations',
    }
  );

  const parsed = AmadeusLocationList.parse(response);
  setCache(cacheKey, parsed.data);
  return parsed.data;
}

export async function resolveCity(input: string, countryHint?: string): Promise<ResolveCityOut> {
  try {
    const locations = await searchLocations({
      keyword: input,
      subType: 'CITY',
      countryCode: countryHint,
    });

    const cities = locations.filter(loc => loc.subType === 'CITY');
    if (cities.length === 0) {
      return { ok: false, reason: 'not_found' };
    }

    const inputNorm = normalize(input);
    const candidates = cities.map(city => {
      const cityName = city.name || city.detailedName || city.address?.cityName || '';
      const similarity = jaroWinkler(inputNorm, normalize(cityName));
      const travScore = city.analytics?.travelers?.score || 0;
      const confidence = Math.min(1, 0.7 * similarity + 0.3 * Math.min(1, travScore / 100));
      
      return {
        cityCode: city.iataCode,
        cityName,
        confidence: Math.round(confidence * 100) / 100,
        location: city,
      };
    }).sort((a, b) => b.confidence - a.confidence);

    const best = candidates[0];
    if (!best || best.confidence < 0.60) {
      return { ok: false, reason: 'ambiguous' };
    }

    return {
      ok: true,
      cityCode: best.cityCode,
      cityName: best.cityName,
      confidence: best.confidence,
      source: 'amadeus',
      geo: best.location.geoCode && best.location.geoCode.latitude !== undefined && best.location.geoCode.longitude !== undefined 
        ? { latitude: best.location.geoCode.latitude, longitude: best.location.geoCode.longitude }
        : undefined,
      candidates: candidates.slice(0, 3).map(c => ({
        cityCode: c.cityCode,
        cityName: c.cityName,
        confidence: c.confidence,
      })),
    };
  } catch (error: any) {
    if (error?.kind === 'timeout') return { ok: false, reason: 'timeout' };
    if (error?.status >= 500) return { ok: false, reason: 'http_5xx' };
    if (error?.status >= 400) return { ok: false, reason: 'http_4xx' };
    return { ok: false, reason: 'network' };
  }
}

export async function airportsForCity(cityCode: string): Promise<Airport[]> {
  const cacheKey = `airports:${cityCode}`;
  const cached = getCached<Airport[]>(cacheKey);
  if (cached) return cached;

  try {
    const locations = await searchLocations({
      keyword: cityCode,
      subType: 'AIRPORT',
    });

    const airports = locations
      .filter(loc => loc.subType === 'AIRPORT' && loc.address?.cityCode === cityCode)
      .map(airport => ({
        iataCode: airport.iataCode,
        name: airport.name || airport.detailedName,
        cityCode,
        score: airport.analytics?.travelers?.score,
        latitude: airport.geoCode?.latitude,
        longitude: airport.geoCode?.longitude,
      }))
      .sort((a, b) => {
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (a.name || '').localeCompare(b.name || '');
      });

    setCache(cacheKey, airports);
    return airports;
  } catch {
    return [];
  }
}
