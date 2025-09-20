import { getAmadeusClient } from '../vendors/amadeus_client.js';
import { withPolicies } from './_sdk_policies.js';
import { toStdError } from './errors.js';

export interface FlightSearchQuery {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  adults: string;
  returnDate?: string;
  max?: string;
  nonStop?: boolean;
  currencyCode?: string;
}

/**
 * Search flight offers using Amadeus SDK GET endpoint.
 */
export async function flightOffersGet(
  query: FlightSearchQuery,
  signal?: AbortSignal
): Promise<any> {
  try {
    console.log('🛫 Starting Amadeus flight search with query:', query);
    
    const result = await withPolicies(async () => {
      console.log('🔗 Getting Amadeus client...');
      const amadeus = await getAmadeusClient();
      
      const params = {
        originLocationCode: query.originLocationCode,
        destinationLocationCode: query.destinationLocationCode,
        departureDate: query.departureDate,
        adults: query.adults,
        ...(query.returnDate && { returnDate: query.returnDate }),
        ...(query.max && { max: query.max }),
        ...(query.nonStop !== undefined && { nonStop: query.nonStop }),
        ...(query.currencyCode && { currencyCode: query.currencyCode }),
      };
      
      console.log('📡 Making Amadeus API call with params:', params);
      const response = await amadeus.shopping.flightOffersSearch.get(params);
      console.log('✅ Amadeus API response received, data length:', response.data?.length || 0);
      return response.data;
    }, signal, 10000); // Keep 10 seconds timeout
    
    // Log successful result
    console.log('Amadeus flight search successful:', result?.length || 0, 'offers');
    
    // Return in expected format for graph
    if (result && result.length > 0) {
      // Extract top 3 flight offers with details
      const topOffers = result.slice(0, 3).map((offer: any) => {
        const price = offer.price?.total;
        const currency = offer.price?.currency || 'EUR';
        const segments = offer.itineraries?.[0]?.segments || [];
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        
        return {
          price: `${price} ${currency}`,
          departure: `${firstSegment?.departure?.iataCode} ${firstSegment?.departure?.at}`,
          arrival: `${lastSegment?.arrival?.iataCode} ${lastSegment?.arrival?.at}`,
          airline: firstSegment?.carrierCode,
          stops: segments.length > 1 ? `${segments.length - 1} stop(s)` : 'Direct'
        };
      });
      
      const summary = `Found ${result.length} flight offers from ${query.originLocationCode} to ${query.destinationLocationCode} on ${query.departureDate}

Top options:
${topOffers.map((offer: any, i: number) => 
  `${i + 1}. ${offer.price} - ${offer.departure} → ${offer.arrival} (${offer.airline}, ${offer.stops})`
).join('\n')}

${result.length > 3 ? `\n...and ${result.length - 3} more options available.` : ''}`;

      return {
        ok: true,
        source: 'amadeus',
        offers: result,
        count: result.length,
        summary
      };
    }
    
    return { ok: false, reason: 'no_results' };
    
  } catch (error) {
    console.error('Amadeus flight search failed:', error);
    const stdError = toStdError(error, 'flightOffersGet');
    
    // Fallback message if enabled and no results
    if (process.env.IATA_RESOLVER === 'llm' && stdError.code === 'not_found') {
      return {
        fallback: true,
        message: 'Flight search temporarily unavailable. Please try alternative airports or check directly with airlines.',
        source: 'llm_fallback',
      };
    }
    
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Search flight offers using Amadeus SDK POST endpoint.
 */
export async function flightOffersPost(
  body: unknown,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      const response = await amadeus.shopping.flightOffersSearch.post(body);
      return response.data;
    }, signal, 6000);
  } catch (error) {
    const stdError = toStdError(error, 'flightOffersPost');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Price flight offers using Amadeus SDK.
 */
export async function flightOffersPrice(
  offer: unknown,
  include?: string,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const body = {
        data: {
          type: 'flight-offers-pricing',
          flightOffers: Array.isArray(offer) ? offer : [offer],
        },
        ...(include && { include }),
      };
      
      const response = await amadeus.shopping.flightOffers.pricing.post(body);
      return response.data;
    }, signal, 6000);
  } catch (error) {
    const stdError = toStdError(error, 'flightOffersPrice');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Get seatmaps from flight offer using Amadeus SDK.
 */
export async function seatmapsFromOffer(
  offer: unknown,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const body = {
        data: Array.isArray(offer) ? offer : [offer],
      };
      
      const response = await amadeus.shopping.seatmaps.post(body);
      return response.data;
    }, signal, 6000);
  } catch (error) {
    const stdError = toStdError(error, 'seatmapsFromOffer');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

// Legacy exports for backward compatibility
export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  passengers?: number;
  cabinClass?: string;
}): Promise<any> {
  console.log('🔍 Starting flight search with params:', params);
  
  // Resolve city names to IATA codes if needed
  let originCode = params.origin;
  let destinationCode = params.destination;
  
  // Quick hardcoded mappings for common cities to avoid API calls
  const cityMappings: Record<string, string> = {
    'London': 'LON',
    'NYC': 'NYC', 
    'New York': 'NYC',
    'New York City': 'NYC',
    'Paris': 'PAR',
    'Tokyo': 'TYO',
    'Berlin': 'BER'
  };
  
  // Try hardcoded mapping first
  if (cityMappings[originCode]) {
    originCode = cityMappings[originCode];
    console.log(`📍 Mapped origin ${params.origin} -> ${originCode}`);
  }
  
  if (cityMappings[destinationCode]) {
    destinationCode = cityMappings[destinationCode];
    console.log(`📍 Mapped destination ${params.destination} -> ${destinationCode}`);
  }
  
  // If not 3-letter codes and not in hardcoded mappings, try to resolve via Amadeus
  if (originCode.length !== 3 || !/^[A-Z]{3}$/.test(originCode)) {
    console.log(`🔍 Resolving origin city: ${originCode}`);
    try {
      const { resolveCity } = await import('./amadeus_locations.js');
      const resolved = await resolveCity(originCode);
      if (resolved.ok) {
        originCode = resolved.cityCode;
        console.log(`✅ Resolved origin: ${params.origin} -> ${originCode}`);
      } else {
        console.log(`❌ Failed to resolve origin: ${params.origin}, reason: ${resolved.reason}`);
      }
    } catch (error) {
      console.log(`❌ Error resolving origin: ${error}`);
    }
  }
  
  if (destinationCode.length !== 3 || !/^[A-Z]{3}$/.test(destinationCode)) {
    console.log(`🔍 Resolving destination city: ${destinationCode}`);
    try {
      const { resolveCity } = await import('./amadeus_locations.js');
      const resolved = await resolveCity(destinationCode);
      if (resolved.ok) {
        destinationCode = resolved.cityCode;
        console.log(`✅ Resolved destination: ${params.destination} -> ${destinationCode}`);
      } else {
        console.log(`❌ Failed to resolve destination: ${params.destination}, reason: ${resolved.reason}`);
      }
    } catch (error) {
      console.log(`❌ Error resolving destination: ${error}`);
    }
  }
  
  console.log(`🛫 Final flight search: ${originCode} -> ${destinationCode} on ${params.departureDate}`);
  
  return flightOffersGet({
    originLocationCode: originCode,
    destinationLocationCode: destinationCode,
    departureDate: params.departureDate,
    adults: ((params.adults || params.passengers) || 1).toString(),
    ...(params.returnDate && { returnDate: params.returnDate }),
  });
}

export async function convertToAmadeusDate(dateStr?: string): Promise<string> {
  if (!dateStr) return '2024-12-01'; // Default date
  
  const lowerDate = dateStr.toLowerCase();
  
  // Handle relative dates
  if (lowerDate === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0]!;
  }
  
  if (lowerDate === 'today') {
    return new Date().toISOString().split('T')[0]!;
  }
  
  // If already in YYYY-MM-DD format, return as-is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Default fallback
  return '2024-12-01';
}

export interface SearchConstraints {
  origin: string;
  destination: string;
  departureDate: string;
  cabin?: string;
  passengers?: number;
}

export interface FlightAlternative {
  departure: string;
  arrival: string;
  carrier: string;
  flightNumber: string;
  price?: number;
}

/**
 * Search for alternative flights for IRROPS scenarios
 */
export async function searchAlternatives(
  originalSegments: any[],
  affectedSegmentIndex: number,
  constraints: SearchConstraints,
  signal?: AbortSignal
): Promise<FlightAlternative[]> {
  try {
    const result = await flightOffersGet({
      originLocationCode: constraints.origin,
      destinationLocationCode: constraints.destination,
      departureDate: constraints.departureDate,
      adults: (constraints.passengers || 1).toString(),
      max: '10'
    }, signal);

    // Handle the wrapped response format
    const offers = result.ok ? result.offers : [];
    if (!offers || offers.length === 0) return [];

    return offers.slice(0, 5).map((offer: any) => {
      const segment = offer.itineraries?.[0]?.segments?.[0];
      return {
        departure: segment?.departure?.at || constraints.departureDate + 'T08:00:00',
        arrival: segment?.arrival?.at || constraints.departureDate + 'T10:00:00',
        carrier: segment?.carrierCode || 'XX',
        flightNumber: (segment?.carrierCode || 'XX') + (segment?.number || '000'),
        price: parseFloat(offer.price?.total || '0')
      };
    });
  } catch (error) {
    console.error('Alternative search failed:', error);
    return [];
  }
}
