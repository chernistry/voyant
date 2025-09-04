import { fetchJSON, ExternalFetchError } from '../util/fetch.js';

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results: BraveSearchResult[];
  };
  mixed?: {
    main: BraveSearchResult[];
    top: BraveSearchResult[];
    side: BraveSearchResult[];
  };
  results?: BraveSearchResult[]; // Alternative format
}

type Out = { ok: true; results: BraveSearchResult[] } | { ok: false; reason: string };

/**
 * Search for travel information using Brave Search API
 */
export async function searchTravelInfo(query: string): Promise<Out> {
  if (!query.trim()) return { ok: false, reason: 'no_query' };
  
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };

  console.log(`🔍 Brave Search: query="${query}", apiKey="${apiKey.slice(0, 10)}..."`);

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=7`;
    console.log(`🔗 Brave Search URL: ${url}`);
    
    const response = await fetchJSON<BraveSearchResponse>(
      url,
      {
        timeoutMs: 5000,
        retries: 2,
        target: 'brave-search',
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json'
        }
      }
    );
    
    console.log(`✅ Brave Search response:`, JSON.stringify(response, null, 2));
    
    // Handle different response structures
    const results = response?.web?.results || 
                   response?.mixed?.main || 
                   response?.results || 
                   [];
    console.log(`✅ Brave Search success: ${results.length} results`);
    return { ok: true, results };
  } catch (e) {
    console.log(`❌ Brave Search error:`, e);
    if (e instanceof ExternalFetchError) {
      return { ok: false, reason: e.kind === 'timeout' ? 'timeout' : e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx' };
    }
    return { ok: false, reason: 'network' };
  }
}

/**
 * Extract weather information from search results
 */
export function extractWeatherFromResults(results: BraveSearchResult[], city: string): string | null {
  const weatherKeywords = ['temperature', 'weather', 'forecast', 'climate', '°c', '°f', 'degrees'];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    if (weatherKeywords.some(keyword => text.includes(keyword)) && text.includes(city.toLowerCase())) {
      // Extract temperature ranges from description
      const tempMatch = text.match(/(\d+)°?[cf]?[\s-]*(?:to|-)[\s-]*(\d+)°?[cf]?/i) || 
                       text.match(/high[\s:]*(\d+)°?[cf]?.*low[\s:]*(\d+)°?[cf]?/i);
      if (tempMatch) {
        return `Based on recent data, expect ${tempMatch[1]}-${tempMatch[2]}°C in ${city}`;
      }
      // Fallback to first weather-related description
      return `Weather info for ${city}: ${result.description.slice(0, 100)}...`;
    }
  }
  return null;
}

/**
 * Extract country facts from search results
 */
export function extractCountryFromResults(results: BraveSearchResult[], country: string): string | null {
  const countryKeywords = ['currency', 'language', 'capital', 'population', 'travel'];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    if (countryKeywords.some(keyword => text.includes(keyword)) && text.includes(country.toLowerCase())) {
      return `Travel info for ${country}: ${result.description.slice(0, 150)}...`;
    }
  }
  return null;
}

/**
 * Extract attractions from search results
 */
export function extractAttractionsFromResults(results: BraveSearchResult[], city: string): string | null {
  const attractionKeywords = ['attractions', 'things to do', 'visit', 'museum', 'park', 'landmark', 'tourist', 'best', 'top'];
  const attractions: string[] = [];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    if (attractionKeywords.some(keyword => text.includes(keyword)) && text.includes(city.toLowerCase())) {
      
      // Simple extraction: look for common attraction names in the description
      const description = result.description;
      const commonAttractions = [
        'Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral', 'Arc de Triomphe',
        'Statue of Liberty', 'Empire State Building', 'Central Park', 'Times Square',
        'Tower Bridge', 'Big Ben', 'London Eye', 'British Museum',
        'Colosseum', 'Vatican', 'Trevi Fountain', 'Spanish Steps',
        'Tokyo Tower', 'Senso-ji Temple', 'Meiji Shrine', 'Tokyo Skytree'
      ];
      
      for (const attraction of commonAttractions) {
        if (description.includes(attraction) && !attractions.includes(attraction)) {
          attractions.push(attraction);
        }
      }
      
      // If no common attractions found, extract from title
      if (attractions.length === 0) {
        const title = result.title.replace(/^\d+\.?\s*/, '').replace(/\s*-.*$/, '');
        if (title.length > 5 && title.length < 50) {
          attractions.push(title);
        }
      }
    }
  }
  
  if (attractions.length > 0) {
    return `Popular attractions in ${city} include: ${attractions.slice(0, 3).join(', ')}`;
  }
  return null;
}
