import { readFile } from 'fs/promises';
import { join } from 'path';
import { getCountryFacts } from './country.js';

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

export async function recommendDestinations(slots: Slots): Promise<DestinationFact[]> {
  try {
    const catalogPath = join(process.cwd(), 'data', 'destinations_catalog.json');
    const catalogData = await readFile(catalogPath, 'utf-8');
    const catalog = JSON.parse(catalogData) as CatalogItem[];
    
    const month = slots.month ?? monthFromDates(slots.dates);
    const isFamily = slots.travelerProfile?.toLowerCase().includes('family') || 
                     slots.travelerProfile?.toLowerCase().includes('kid') ||
                     slots.travelerProfile?.toLowerCase().includes('child');
    
    // Filter by month if specified
    const filtered = catalog.filter(c => !month || c.months.includes(month));
    
    // Score destinations based on user preferences
    const scored = filtered.map(c => {
      let score = 0;
      if (isFamily && c.family) score += 2;
      if (slots.budget && c.budget === slots.budget) score += 1;
      if (slots.climate && c.climate === slots.climate) score += 1;
      // Boost popular destinations slightly
      if (['Paris', 'London', 'Rome', 'Barcelona', 'Amsterdam'].includes(c.city)) score += 0.5;
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
