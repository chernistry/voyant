import { searchTravelInfo as braveSearch } from './brave_search.js';
import { searchTravelInfo as tavilySearch } from './tavily_search.js';
import type { Out } from './brave_search.js';

export {
  extractWeatherFromResults,
  extractCountryFromResults,
  llmExtractWeatherFromResults,
  llmExtractCountryFromResults,
  llmExtractAttractionsFromResults,
} from './brave_search.js';
export type { SearchResult, Out } from './brave_search.js';

function provider(): string {
  return (process.env.SEARCH_PROVIDER || 'brave').toLowerCase();
}

export function getSearchSource(): string {
  return provider() === 'tavily' ? 'tavily-search' : 'brave-search';
}

export function getSearchCitation(): string {
  return provider() === 'tavily' ? 'Tavily Search' : 'Brave Search';
}

/** Dispatch to configured search provider */
export async function searchTravelInfo(
  query: string,
  log?: any,
  deepResearch = false,
): Promise<Out> {
  return provider() === 'tavily'
    ? tavilySearch(query, log, deepResearch)
    : braveSearch(query, log, deepResearch);
}
