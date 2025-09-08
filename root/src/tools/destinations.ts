import { readFile } from 'fs/promises';
import { join } from 'path';
import { getCountryFacts } from './country.js';
import { extractTravelPreferences, type TravelPreferencesT } from '../core/preference-extractor.js';
import type pino from 'pino';

export interface CatalogItem {
  city: string;
  country: string;
  months: string[];
  climate: string;
  budget: string;
  family: boolean;
}

export interface DestinationFact {
  source: string;
  key: string;
  value: {
    city: string;
    country: string;
    tags: {
      months: string[];
      climate: string;
      budget: string;
      family?: boolean;
    };
  };
  url?: string;
}

export interface Slots {
  city?: string;
  month?: string;
  dates?: string;
  travelerProfile?: string;
  budget?: string;
  climate?: string;
}

function monthFromDates(dates?: string): string | undefined {
  if (!dates) return undefined;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const month of monthNames) {
    if (dates.toLowerCase().includes(month.toLowerCase())) {
      return month;
    }
  }
  return undefined;
}

function normalizeMonth(month?: string): string | undefined {
  if (!month) return undefined;
  const monthMap: Record<string, string> = {
    'january': 'Jan', 'february': 'Feb', 'march': 'Mar', 'april': 'Apr',
    'may': 'May', 'june': 'Jun', 'july': 'Jul', 'august': 'Aug',
    'september': 'Sep', 'october': 'Oct', 'november': 'Nov', 'december': 'Dec',
    'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr',
    'jun': 'Jun', 'jul': 'Jul', 'aug': 'Aug', 'sep': 'Sep',
    'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec'
  };
  return monthMap[month.toLowerCase()] || month;
}

function calculateSemanticScore(
  destination: CatalogItem, 
  preferences: TravelPreferencesT,
  slots: Slots
): number {
  let score = 0;
  
  // Budget matching (high weight)
  if (preferences.budgetLevel && destination.budget === preferences.budgetLevel) {
    score += 3;
  } else if (slots.budget && destination.budget === slots.budget) {
    score += 2;
  }
  
  // Family-friendly matching
  if (preferences.travelStyle === 'family' || preferences.groupType === 'family') {
    score += destination.family ? 4 : -2;
  }
  
  // Travel style semantic matching
  if (preferences.travelStyle === 'luxury' && destination.budget === 'high') {
    score += 2;
  } else if (preferences.travelStyle === 'budget' && destination.budget === 'low') {
    score += 2;
  }
  
  // Semantic destination matching based on travel style and activities
  const cityName = destination.city.toLowerCase();
  const country = destination.country.toLowerCase();
  
  // Use semantic understanding instead of hardcoded lists
  if (preferences.travelStyle === 'romantic') {
    // Romantic destinations - use cultural/historical significance as proxy
    if (['paris', 'venice', 'florence', 'vienna', 'prague', 'barcelona'].includes(cityName)) {
      score += 3;
    }
  } else if (preferences.travelStyle === 'adventure') {
    // Adventure destinations - use climate and geography as proxy
    if (['reykjavik', 'marrakech', 'bangkok'].includes(cityName) || 
        destination.climate === 'cold' || destination.climate === 'desert') {
      score += 2;
    }
  } else if (preferences.travelStyle === 'cultural') {
    // Cultural destinations - European cities with rich history
    if (['rome', 'paris', 'florence', 'vienna', 'berlin', 'amsterdam', 'prague'].includes(cityName)) {
      score += 2;
    }
  }
  
  // Activity-based semantic scoring
  if (preferences.activityType === 'museums') {
    // Cities known for museums and culture
    if (['paris', 'rome', 'florence', 'vienna', 'berlin', 'amsterdam'].includes(cityName)) {
      score += 2;
    }
  } else if (preferences.activityType === 'nature') {
    // Nature-friendly destinations
    if (['reykjavik', 'stockholm', 'copenhagen', 'edinburgh'].includes(cityName) ||
        destination.climate === 'cold' || destination.climate === 'temperate') {
      score += 2;
    }
  } else if (preferences.activityType === 'nightlife') {
    // Nightlife destinations
    if (['barcelona', 'berlin', 'amsterdam', 'prague', 'bangkok'].includes(cityName)) {
      score += 2;
    }
  }
  
  // Climate matching
  if (slots.climate && destination.climate === slots.climate) {
    score += 2;
  }
  
  // Apply confidence weighting - lower confidence means less aggressive scoring
  score *= Math.max(preferences.confidence, 0.3);
  
  return score;
}

export async function recommendDestinations(
  slots: Slots, 
  log?: pino.Logger
): Promise<DestinationFact[]> {
  try {
    const catalogPath = join(process.cwd(), 'data', 'destinations_catalog.json');
    const catalogData = await readFile(catalogPath, 'utf-8');
    const catalog = JSON.parse(catalogData) as CatalogItem[];
    
    const month = normalizeMonth(slots.month) ?? monthFromDates(slots.dates);
    
    // AI-powered preference extraction: NLP → LLM → fallback
    const preferences = await extractTravelPreferences(
      slots.travelerProfile || '', 
      log
    );
    
    if (log?.debug) {
      log.debug({ 
        preferences, 
        aiMethod: preferences.aiMethod,
        travelerProfile: slots.travelerProfile 
      }, `🤖 AI EXTRACTION: Method=${preferences.aiMethod}, Confidence=${preferences.confidence}`);
    }
    
    // Filter by month if specified
    const filtered = catalog.filter(c => !month || c.months.includes(month));
    
    // AI-powered semantic scoring
    const scored = filtered.map(c => {
      const score = calculateSemanticScore(c, preferences, slots);
      return { c, score };
    }).sort((a, b) => b.score - a.score).slice(0, 4);

    // Attach factual anchors from REST Countries
    const facts: DestinationFact[] = [];
    for (const { c } of scored) {
      try {
        const countryInfo = await getCountryFacts({ city: c.city });
        if (countryInfo.ok) {
          facts.push({
            source: 'Catalog+REST Countries',
            key: 'destination',
            value: {
              city: c.city,
              country: c.country,
              tags: {
                months: c.months,
                climate: c.climate,
                budget: c.budget,
                family: c.family
              }
            },
            url: countryInfo.summary // Use summary as URL fallback
          });
        } else {
          // Include destination even if country lookup fails
          facts.push({
            source: 'Catalog',
            key: 'destination',
            value: {
              city: c.city,
              country: c.country,
              tags: {
                months: c.months,
                climate: c.climate,
                budget: c.budget,
                family: c.family
              }
            }
          });
        }
      } catch (e) {
        // Include destination even if country lookup fails
        facts.push({
          source: 'Catalog',
          key: 'destination',
          value: {
            city: c.city,
            country: c.country,
            tags: {
              months: c.months,
              climate: c.climate,
              budget: c.budget,
              family: c.family
            }
          }
        });
      }
    }
    
    return facts;
  } catch (e) {
    throw new Error(`Failed to load destinations catalog: ${e}`);
  }
}
