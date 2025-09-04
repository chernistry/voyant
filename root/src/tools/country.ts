import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchTravelInfo, extractCountryFromResults } from './brave_search.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string };

export async function getCountryFacts(input: { city?: string }): Promise<Out> {
  if (!input.city) return { ok: false, reason: 'no_city' };
  
  // Try primary API first
  const primaryResult = await tryPrimaryCountryAPI(input.city);
  if (primaryResult.ok) {
    return primaryResult;
  }

  // Fallback to Brave Search
  const fallbackResult = await tryCountryFallback(input.city);
  if (fallbackResult.ok) {
    return { 
      ...fallbackResult, 
      summary: `The country information service is currently unavailable, but here are some web search results: ${fallbackResult.summary}`,
      source: 'brave-search' 
    };
  }

  return primaryResult; // Return original error
}

async function tryPrimaryCountryAPI(city: string): Promise<Out> {
  // Resolve country via geocoding API to avoid hardcoded city→country mapping
  type GeoItem = { country?: string };
  type GeoResp = { results?: GeoItem[] };
  try {
    const g = await fetchJSON<GeoResp>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1&language=en&format=json`,
      { timeoutMs: 4000, retries: 3, target: 'open-meteo:geocode' },
    );
    const country = (g.results ?? [])[0]?.country;
    if (!country) return { ok: false, reason: 'unknown_city' };
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(
      country,
    )}?fields=name,currencies,languages,region`;
    type Country = {
      name?: { common?: string };
      currencies?: Record<string, unknown>;
      languages?: Record<string, string>;
      region?: string;
    };
    const res = await fetchJSON<unknown>(url, { target: 'restcountries' });
    const c: Country | undefined = Array.isArray(res)
      ? (res as Country[])[0]
      : (res as Country);
    const cur = c?.currencies ? Object.keys(c.currencies)[0] : 'N/A';
    const langs = c?.languages ? Object.values(c.languages) : [];
    const lang = langs.length > 1 ? langs.join(', ') : langs[0] || 'N/A';
    const summary = `${c?.name?.common} • Region: ${c?.region} • Currency: ${cur} • Language: ${lang}`;
    return { ok: true, summary, source: 'rest-countries' };
  } catch (e) {
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
    }
    return { ok: false, reason: 'network' };
  }
}

async function tryCountryFallback(city: string): Promise<Out> {
  // First try to get country name from geocoding
  let country = city;
  try {
    type GeoItem = { country?: string };
    type GeoResp = { results?: GeoItem[] };
    const g = await fetchJSON<GeoResp>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1&language=en&format=json`,
      { timeoutMs: 4000, retries: 1, target: 'open-meteo:geocode' },
    );
    country = (g.results ?? [])[0]?.country || city;
  } catch {
    // Use city name as fallback
  }

  const query = `travel information ${country} currency language capital`;
  
  const searchResult = await searchTravelInfo(query);
  if (!searchResult.ok) {
    return { ok: false, reason: 'fallback_failed' };
  }

  const countryInfo = extractCountryFromResults(searchResult.results, country);
  if (countryInfo) {
    return { ok: true, summary: countryInfo };
  }

  return { ok: false, reason: 'no_country_data' };
}


