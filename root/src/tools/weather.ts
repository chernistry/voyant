import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import {
  searchTravelInfo,
  extractWeatherFromResults,
  llmExtractWeatherFromResults,
  getSearchSource,
} from './search.js';


function withTimeout(ms: number, signal?: AbortSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  const linked = signal ? AbortSignal.any([ctrl.signal, signal]) : ctrl.signal;
  return { signal: linked, cancel: () => clearTimeout(t) };
}

type OpenMeteoDaily = {
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_mean?: number[];
};

type OpenMeteoResp = { daily?: OpenMeteoDaily };


type Out = { ok: true; summary: string; source?: string } | { ok: false; reason: string };


export async function getWeather(input: {
  city?: string;
  datesOrMonth?: string;
}): Promise<Out> {
  if (!input.city) return { ok: false, reason: 'no_city' };

  // Try primary API first
  const primaryResult = await tryPrimaryWeatherAPI(input.city);
  if (primaryResult.ok) {
    return primaryResult;
  }
  // For unknown cities, avoid falling back to generic web search to prevent hallucinations
  if (!primaryResult.ok && primaryResult.reason === 'unknown_city') {
    return primaryResult;
  }

  // Fallback to configured web search
  const fallbackResult = await tryWeatherFallback(input.city, input.datesOrMonth);
  if (fallbackResult.ok) {
    return { 
      ...fallbackResult, 
      summary: `The weather service is currently unavailable, but here are some web search results: ${fallbackResult.summary}`,
      source: getSearchSource(),
    };
  }

  return primaryResult; // Return original error
}

async function tryPrimaryWeatherAPI(city: string): Promise<Out> {
  // Resolve city to coordinates via Open-Meteo Geocoding API (no hardcoded cities)
  type GeoItem = {
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    country_code?: string;
  };
  type GeoResp = { results?: GeoItem[] };
  try {
    const g = await fetchJSON<GeoResp>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1&language=en&format=json`,
      { timeoutMs: 4000, retries: 3, target: 'open-meteo:geocode' },
    );
    const first = (g.results ?? [])[0];
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
      return { ok: false, reason: 'unknown_city' };
    }
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean&timezone=auto`;
    try {
      const j = await fetchJSON<OpenMeteoResp>(url, {
        timeoutMs: 4000,
        retries: 3,
        target: 'open-meteo',
      });
      const max = j.daily?.temperature_2m_max?.[0];
      const min = j.daily?.temperature_2m_min?.[0];
      const pp = j.daily?.precipitation_probability_mean?.[0];
      const summary = `High ${max}°C / Low ${min}°C; precip prob ${pp}%`;
      return { ok: true, summary, source: 'open-meteo' };
    } catch (e) {
      if (e instanceof ExternalFetchError) {
        return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
      }
      return { ok: false, reason: 'network' };
    }
  } catch (e) {
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : 'network' };
    }
    return { ok: false, reason: 'network' };
  }
}

async function tryWeatherFallback(city: string, datesOrMonth?: string): Promise<Out> {
  const timeContext = datesOrMonth ? ` ${datesOrMonth}` : '';
  const query = `weather in ${city}${timeContext} temperature forecast`;
  
  const searchResult = await searchTravelInfo(query);
  if (!searchResult.ok) {
    return { ok: false, reason: 'fallback_failed' };
  }

  // LLM-first extraction
  const weatherInfoLLM = await llmExtractWeatherFromResults(searchResult.results, city);
  if (weatherInfoLLM) {
    return { ok: true, summary: weatherInfoLLM, source: getSearchSource() };
  }

  return { ok: false, reason: 'no_weather_data' };
}

