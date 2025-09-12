import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';
import { getAmadeusToken } from './amadeus_auth.js';
import { resolveCity } from './amadeus_locations.js';
import { z } from 'zod';

const AmadeusFlightOffer = z.object({
  id: z.string(),
  price: z.object({
    currency: z.string(),
    total: z.string(),
  }),
  itineraries: z.array(z.object({
    duration: z.string(),
    segments: z.array(z.object({
      departure: z.object({
        iataCode: z.string(),
        at: z.string(),
      }),
      arrival: z.object({
        iataCode: z.string(),
        at: z.string(),
      }),
      carrierCode: z.string(),
      number: z.string(),
      duration: z.string(),
    })),
  })),
});

const AmadeusFlightSearchResponse = z.object({
  data: z.array(AmadeusFlightOffer),
});

type FlightSearchParams = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  infants?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  nonStop?: boolean;
  maxPrice?: number;
  max?: number;
};

type FlightSearchResult = {
  ok: true;
  flights: Array<{
    id: string;
    price: { currency: string; total: string };
    duration: string;
    segments: Array<{
      departure: { airport: string; time: string };
      arrival: { airport: string; time: string };
      airline: string;
      flightNumber: string;
      duration: string;
    }>;
  }>;
  source: string;
} | {
  ok: false;
  reason: string;
};

async function legacyLLMFallback(cityOrAirport: string): Promise<string> {
  try {
    const promptTemplate = await getPrompt('iata_code_generator');
    const prompt = promptTemplate.replace('{city_or_airport}', cityOrAirport);
    const response = await callLLM(prompt);
    const code = response.trim().toUpperCase().replace(/[^A-Z]/g, '');
    
    if (code.length === 3 && /^[A-Z]{3}$/.test(code)) {
      return code;
    }
    
    return cityOrAirport.toUpperCase().substring(0, 3);
  } catch {
    return cityOrAirport.toUpperCase().substring(0, 3);
  }
}

async function getIataCode(cityOrAirport: string): Promise<string> {
  const raw = cityOrAirport.trim();
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  
  try {
    const resolved = await resolveCity(raw);
    if (resolved.ok && resolved.confidence >= 0.75) {
      return resolved.cityCode;
    }
  } catch {}
  
  return await legacyLLMFallback(cityOrAirport);
}

async function searchAmadeusFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
  try {
    const token = await getAmadeusToken();
    const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
    
    const searchParams = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departureDate,
      adults: (params.adults || 1).toString(),
      max: (params.max || 10).toString(),
    });

    if (params.returnDate) {
      searchParams.append('returnDate', params.returnDate);
    }
    if (params.children) {
      searchParams.append('children', params.children.toString());
    }
    if (params.infants) {
      searchParams.append('infants', params.infants.toString());
    }
    if (params.travelClass) {
      searchParams.append('travelClass', params.travelClass);
    }
    if (params.nonStop) {
      searchParams.append('nonStop', 'true');
    }
    if (params.maxPrice) {
      searchParams.append('maxPrice', params.maxPrice.toString());
    }

    const response = await fetchJSON<z.infer<typeof AmadeusFlightSearchResponse>>(
      `${baseUrl}/v2/shopping/flight-offers?${searchParams.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        timeoutMs: 10000,
        retries: 2,
        target: 'amadeus:flights',
      }
    );

    const parsed = AmadeusFlightSearchResponse.parse(response);
    
    const flights = parsed.data.map(offer => ({
      id: offer.id,
      price: {
        currency: offer.price.currency || 'USD',
        total: offer.price.total || '0.00',
      },
      duration: offer.itineraries[0]?.duration || 'Unknown',
      segments: offer.itineraries[0]?.segments.map(segment => ({
        departure: {
          airport: segment.departure.iataCode,
          time: segment.departure.at,
        },
        arrival: {
          airport: segment.arrival.iataCode,
          time: segment.arrival.at,
        },
        airline: segment.carrierCode,
        flightNumber: `${segment.carrierCode}${segment.number}`,
        duration: segment.duration,
      })) || [],
    }));

    return {
      ok: true,
      flights,
      source: 'amadeus',
    };
  } catch (error) {
    if (error instanceof ExternalFetchError) {
      return {
        ok: false,
        reason: error.kind === 'timeout' ? 'timeout' : 
                error.status && error.status >= 500 ? 'http_5xx' : 'http_4xx',
      };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

async function convertToAmadeusDate(dateStr: string): Promise<string> {
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Handle "today" explicitly
  if (/^today$/i.test(dateStr.trim())) {
    return new Date().toISOString().split('T')[0] || new Date().getFullYear() + '-01-01';
  }
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Handle common formats directly
  if (dateStr.match(/^(October|Oct)\s+(\d{1,2})$/i)) {
    const day = dateStr.match(/(\d{1,2})/)?.[1];
    if (day) {
      const testDate = new Date(currentYear, 9, parseInt(day)); // October = month 9
      const targetYear = testDate < today ? currentYear + 1 : currentYear;
      return `${targetYear}-10-${day.padStart(2, '0')}`;
    }
  }
  
  try {
    // Use dedicated date parser for other formats
    const promptTemplate = await getPrompt('date_parser');
    const prompt = promptTemplate.replace('{text}', dateStr).replace('{context}', 'flight booking');
    const response = await callLLM(prompt);
    const parsed = JSON.parse(response);
    
    if (parsed.confidence > 0.5 && parsed.dates) {
      // Handle relative dates
      if (parsed.dates === 'today') {
        return new Date().toISOString().split('T')[0] || `${currentYear}-01-01`;
      }
      if (parsed.dates === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0] || `${currentYear}-01-02`;
      }
      
      let date = new Date(parsed.dates);
      if (!isNaN(date.getTime())) {
        // If date is in the past, assume next year
        if (date < today) {
          date.setFullYear(date.getFullYear() + 1);
        }
        return date.toISOString().split('T')[0] || `${currentYear}-01-01`;
      }
    }
  } catch (error) {
    console.debug('Date parser failed, using fallback:', error);
  }
  
  // Handle DD-MM-YYYY format explicitly
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1];
    const month = ddmmyyyyMatch[2]; 
    const year = ddmmyyyyMatch[3];
    if (day && month && year) {
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        const isoString = date.toISOString().split('T')[0];
        return isoString || `${currentYear}-01-01`;
      }
    }
  }
  
  // Fallback: try basic parsing
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    if (date < today) {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date.toISOString().split('T')[0] || `${currentYear}-01-01`;
  }
  
  // Last resort
  return `${currentYear + 1}-01-01`;
}

export { convertToAmadeusDate };

export async function searchFlights(input: {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  passengers?: number;
  cabinClass?: string;
}): Promise<{ ok: true; summary: string; source: string; reason?: string } | { ok: false; reason: string }> {
  // Validation is now handled in graph.ts, but we'll keep a basic check
  if (!input.origin || !input.destination || !input.departureDate) {
    return { ok: false, reason: 'missing_required_fields' };
  }

  // Convert city names to IATA codes
  const originCode = await getIataCode(input.origin);
  const destinationCode = await getIataCode(input.destination);

  // Convert dates to Amadeus format (YYYY-MM-DD)
  const formattedDepartureDate = await convertToAmadeusDate(input.departureDate);
  const formattedReturnDate = input.returnDate ? await convertToAmadeusDate(input.returnDate) : undefined;

  console.debug('Date conversion:', {
    input: input.departureDate,
    output: formattedDepartureDate,
    today: new Date().toISOString().split('T')[0]
  });

  // Convert cabin class to Amadeus format
  let travelClass: FlightSearchParams['travelClass'] = 'ECONOMY';
  if (input.cabinClass) {
    const classLower = input.cabinClass.toLowerCase();
    if (classLower.includes('business')) travelClass = 'BUSINESS';
    else if (classLower.includes('first')) travelClass = 'FIRST';
    else if (classLower.includes('premium')) travelClass = 'PREMIUM_ECONOMY';
  }

  const searchParams: FlightSearchParams = {
    origin: originCode,
    destination: destinationCode,
    departureDate: formattedDepartureDate,
    returnDate: formattedReturnDate,
    adults: input.passengers || 1,
    travelClass,
    max: 5, // Limit results for summary
  };

  const result = await searchAmadeusFlights(searchParams);
  
  if (!result.ok) {
    return { ok: false, reason: (result as any).reason };
  }

  if (result.flights.length === 0) {
    return { ok: false, reason: 'no_flights_found' };
  }

  // Create AI-friendly summary
  const tripType = input.returnDate ? 'round-trip' : 'one-way';
  const flightSummaries = result.flights.slice(0, 3).map((flight, idx) => {
    if (!flight.segments.length) return `${idx + 1}. Flight details unavailable`;
    
    const stops = flight.segments.length > 1 ? ` (${flight.segments.length - 1} stop${flight.segments.length > 2 ? 's' : ''})` : ' (nonstop)';
    
    // Show all segments for complete journey
    const segmentDetails = flight.segments.map((segment, segIdx) => {
      const departureTime = new Date(segment.departure.time).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'UTC'
      });
      const arrivalTime = new Date(segment.arrival.time).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'UTC' 
      });
      
      return `   ${segment.flightNumber}: ${departureTime} ${segment.departure.airport} → ${arrivalTime} ${segment.arrival.airport}`;
    }).join('\n');
    
    return `${idx + 1}. ${flight.price.currency} ${flight.price.total}${stops} - Total: ${flight.duration}
${segmentDetails}`;
  }).join('\n\n');

  const summary = `Found ${result.flights.length} ${tripType} flight${result.flights.length > 1 ? 's' : ''} from ${input.origin} to ${input.destination} on ${formattedDepartureDate}:

${flightSummaries}

Note: Times shown in UTC. Check airline for local times and booking details.`;

  return {
    ok: true,
    summary,
    source: result.source,
  };
}
