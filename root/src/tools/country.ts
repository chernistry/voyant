import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import {
  searchTravelInfo,
  extractCountryFromResults,
  llmExtractCountryFromResults,
  getSearchSource,
} from './search.js';
import { extractEntities } from '../core/ner.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';

type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string };

export async function getCountryFacts(input: { city?: string; country?: string }): Promise<Out> {
  const target = input.country || input.city;
  if (!target) return { ok: false, reason: 'no_city' };
  
  // NLP-enhanced country detection
  const locationInfo = await detectLocationWithNLP(target);
  
  if (locationInfo.isCountry) {
    // Direct country lookup
    const directResult = await tryDirectCountryAPI(locationInfo.resolvedName);
    if (directResult.ok) {
      return directResult;
    }
  }
  
  // Try primary API first (city-based)
  const primaryResult = await tryPrimaryCountryAPI(target);
  if (primaryResult.ok) {
    return primaryResult;
  }

  // Fallback to web search
  const fallbackResult = await tryCountryFallback(target);
  if (fallbackResult.ok) {
    return {
      ...fallbackResult,
      summary: `${fallbackResult.summary}`,
      source: getSearchSource(),
    };
  }

  return primaryResult; // Return original error
}

/**
 * NLP-enhanced location detection with disambiguation
 */
async function detectLocationWithNLP(target: string): Promise<{
  isCountry: boolean;
  resolvedName: string;
  confidence: number;
}> {
  try {
    // Extract location entities using NER
    const entities = await extractEntities(target);
    const locationEntities = entities.filter(e => 
      ['LOC', 'LOCATION', 'GPE'].includes(e.entity_group.toUpperCase())
    );

    if (locationEntities.length === 0) {
      // Fallback: use LLM for disambiguation
      return await llmDisambiguateLocation(target);
    }

    // Use highest confidence location entity
    const primaryLocation = locationEntities.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    // Context-aware classification
    const isCountry = await classifyAsCountry(target, primaryLocation.text);
    
    return {
      isCountry,
      resolvedName: primaryLocation.text,
      confidence: primaryLocation.score
    };
  } catch {
    // Fallback to simple heuristics
    return {
      isCountry: await isLikelyCountry(target),
      resolvedName: target,
      confidence: 0.5
    };
  }
}

/**
 * LLM-based location disambiguation for ambiguous cases
 */
async function llmDisambiguateLocation(target: string): Promise<{
  isCountry: boolean;
  resolvedName: string;
  confidence: number;
}> {
  try {
    const tpl = await getPrompt('country_disambiguator');
    const prompt = tpl.replace('{target}', target);

    const response = await callLLM(prompt, { timeoutMs: 5000 });
    const parsed = JSON.parse(response.trim());
    
    return {
      isCountry: Boolean(parsed.isCountry),
      resolvedName: String(parsed.resolvedName || target),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.7)))
    };
  } catch {
    return {
      isCountry: await isLikelyCountry(target),
      resolvedName: target,
      confidence: 0.6
    };
  }
}

/**
 * Context-aware country classification
 */
async function classifyAsCountry(fullText: string, locationName: string): Promise<boolean> {
  const countryIndicators = ['visa', 'currency', 'travel to', 'country', 'nation'];
  const cityIndicators = ['attractions', 'things to do', 'visit', 'hotel', 'restaurant'];
  
  const text = fullText.toLowerCase();
  const countryScore = countryIndicators.filter(ind => text.includes(ind)).length;
  const cityScore = cityIndicators.filter(ind => text.includes(ind)).length;
  
  if (countryScore > cityScore) return true;
  if (cityScore > countryScore) return false;
  
  // Fallback to known country patterns
  return await isLikelyCountry(locationName);
}

/**
 * Simple heuristic fallback for country detection
 */
async function isLikelyCountry(name: string): Promise<boolean> {
  const knownCountries = [
    'spain', 'france', 'italy', 'germany', 'japan', 'canada', 'australia', 
    'brazil', 'mexico', 'india', 'china', 'russia', 'uk', 'usa', 'america', 
    'united states', 'united kingdom', 'netherlands', 'sweden', 'norway'
  ];
  return knownCountries.some(country => name.toLowerCase().includes(country));
}

async function tryDirectCountryAPI(countryName: string): Promise<Out> {
  try {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(
      countryName,
    )}?fields=name,currencies,languages,region,capital,timezones,borders`;
    type Country = {
      name?: { common?: string };
      currencies?: Record<string, { name?: string; symbol?: string }>;
      languages?: Record<string, string>;
      region?: string;
      capital?: string[];
      timezones?: string[];
      borders?: string[];
    };
    const res = await fetchJSON<unknown>(url, { target: 'restcountries' });
    const c: Country | undefined = Array.isArray(res)
      ? (res as Country[])[0]
      : (res as Country);
    
    // Enhanced fact extraction
    const currency = c?.currencies ? Object.entries(c.currencies)[0] : null;
    const currencyInfo = currency ? `${currency[1].name} (${currency[1].symbol || currency[0]})` : 'N/A';
    
    const langs = c?.languages ? Object.values(c.languages) : [];
    const language = langs.length > 1 ? langs.slice(0, 2).join(', ') + (langs.length > 2 ? '...' : '') : langs[0] || 'N/A';
    
    const capital = c?.capital?.[0] || 'N/A';
    const timezone = c?.timezones?.[0] || 'N/A';
    
    const summary = `${c?.name?.common} • Capital: ${capital} • Region: ${c?.region} • Currency: ${currencyInfo} • Language: ${language} • Timezone: ${timezone}`;
    return { ok: true, summary, source: 'rest-countries' };
  } catch (e) {
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
    }
    return { ok: false, reason: 'network' };
  }
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

  // LLM-first extraction
  const countryInfoLLM = await llmExtractCountryFromResults(searchResult.results, country);
  if (countryInfoLLM) {
    return { ok: true, summary: countryInfoLLM };
  }

  // Enhanced semantic fallback
  const countryInfo = await extractCountryFromResults(searchResult.results, country);
  if (countryInfo) {
    return { ok: true, summary: countryInfo };
  }

  return { ok: false, reason: 'no_country_data' };
}


