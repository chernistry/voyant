import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { searchTravelInfo, extractCountryFromResults, llmExtractCountryFromResults } from './brave_search.js';
export async function getCountryFacts(input) {
    const target = input.country || input.city;
    if (!target)
        return { ok: false, reason: 'no_city' };
    // Check if target is likely a country name
    const countryNames = ['spain', 'france', 'italy', 'germany', 'japan', 'canada', 'australia', 'brazil', 'mexico', 'india', 'china', 'russia', 'uk', 'usa', 'america', 'united states', 'united kingdom'];
    const isCountryName = countryNames.some(country => target.toLowerCase().includes(country));
    if (isCountryName) {
        // Direct country lookup
        const directResult = await tryDirectCountryAPI(target);
        if (directResult.ok) {
            return directResult;
        }
    }
    // Try primary API first (city-based)
    const primaryResult = await tryPrimaryCountryAPI(target);
    if (primaryResult.ok) {
        return primaryResult;
    }
    // Fallback to Brave Search
    const fallbackResult = await tryCountryFallback(target);
    if (fallbackResult.ok) {
        return {
            ...fallbackResult,
            summary: `${fallbackResult.summary}`,
            source: 'brave-search'
        };
    }
    return primaryResult; // Return original error
}
async function tryDirectCountryAPI(countryName) {
    try {
        const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fields=name,currencies,languages,region,capital`;
        const res = await fetchJSON(url, { target: 'restcountries' });
        const c = Array.isArray(res)
            ? res[0]
            : res;
        const cur = c?.currencies ? Object.keys(c.currencies)[0] : 'N/A';
        const langs = c?.languages ? Object.values(c.languages) : [];
        const lang = langs.length > 1 ? langs.join(', ') : langs[0] || 'N/A';
        const capital = c?.capital?.[0] || 'N/A';
        const summary = `${c?.name?.common} • Capital: ${capital} • Region: ${c?.region} • Currency: ${cur} • Language: ${lang}`;
        return { ok: true, summary, source: 'rest-countries' };
    }
    catch (e) {
        if (e instanceof ExternalFetchError) {
            return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
        }
        return { ok: false, reason: 'network' };
    }
}
async function tryPrimaryCountryAPI(city) {
    try {
        const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`, { timeoutMs: 4000, retries: 3, target: 'open-meteo:geocode' });
        const country = (g.results ?? [])[0]?.country;
        if (!country)
            return { ok: false, reason: 'unknown_city' };
        const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,currencies,languages,region`;
        const res = await fetchJSON(url, { target: 'restcountries' });
        const c = Array.isArray(res)
            ? res[0]
            : res;
        const cur = c?.currencies ? Object.keys(c.currencies)[0] : 'N/A';
        const langs = c?.languages ? Object.values(c.languages) : [];
        const lang = langs.length > 1 ? langs.join(', ') : langs[0] || 'N/A';
        const summary = `${c?.name?.common} • Region: ${c?.region} • Currency: ${cur} • Language: ${lang}`;
        return { ok: true, summary, source: 'rest-countries' };
    }
    catch (e) {
        if (e instanceof ExternalFetchError) {
            return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
        }
        return { ok: false, reason: 'network' };
    }
}
async function tryCountryFallback(city) {
    // First try to get country name from geocoding
    let country = city;
    try {
        const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`, { timeoutMs: 4000, retries: 1, target: 'open-meteo:geocode' });
        country = (g.results ?? [])[0]?.country || city;
    }
    catch {
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
    // Heuristic fallback
    const countryInfo = extractCountryFromResults(searchResult.results, country);
    if (countryInfo) {
        return { ok: true, summary: countryInfo };
    }
    return { ok: false, reason: 'no_country_data' };
}
