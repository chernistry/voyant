import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';
import { z } from 'zod';

// Amadeus API schemas
const AmadeusTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

const AmadeusLocation = z.object({
  iataCode: z.string(),
  name: z.string().optional(),
  cityName: z.string().optional(),
  countryName: z.string().optional(),
});

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

async function getIataCode(cityOrAirport: string): Promise<string> {
  try {
    const promptTemplate = await getPrompt('iata_code_generator');
    const prompt = promptTemplate.replace('{city_or_airport}', cityOrAirport);
    const response = await callLLM(prompt);
    const code = response.trim().toUpperCase().replace(/[^A-Z]/g, '');
    
    // Validate it's 3 letters
    if (code.length === 3 && /^[A-Z]{3}$/.test(code)) {
      return code;
    }
    
    // Fallback to original if invalid
    return cityOrAirport.toUpperCase().substring(0, 3);
  } catch {
    return cityOrAirport.toUpperCase().substring(0, 3);
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string> {
  const now = Date.now();
  
  if (cachedToken && cachedToken.expiresAt > now + 60000) { // 1 min buffer
    return cachedToken.token;
  }

  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Amadeus credentials not configured');
  }

  const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
  
  try {
    // Use native fetch for POST requests since fetchJSON doesn't support them
    const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new ExternalFetchError('http', `HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    const parsed = AmadeusTokenResponse.parse(data);
    cachedToken = {
      token: parsed.access_token,
      expiresAt: now + (parsed.expires_in * 1000) - 60000, // 1 min buffer
    };

    return parsed.access_token;
  } catch (error) {
    if (error instanceof ExternalFetchError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalFetchError('timeout', 'Request timeout');
    }
    throw new ExternalFetchError('network', 'Network error');
  }
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
      price: offer.price,
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

function convertToAmadeusDate(dateStr: string): string {
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Handle DD-MM-YYYY format specifically (like 12-10-2025)
  const dmyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    if (day && month && year) {
      // For DD-MM-YYYY format, we need to be more specific
      // Let's check if the first number is likely a day (≤31) and second is likely a month (≤12)
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      
      // If first number > 12, it's likely DD-MM-YYYY
      if (dayNum > 12) {
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        return `${year}-${paddedMonth}-${paddedDay}`;
      }
      
      // If second number > 12, it's likely MM-DD-YYYY
      if (monthNum > 12) {
        const paddedMonth = day.padStart(2, '0');
        const paddedDay = month.padStart(2, '0');
        return `${year}-${paddedMonth}-${paddedDay}`;
      }
      
      // If second number > 31, it's likely MM-DD-YYYY
      if (monthNum > 31) {
        const paddedMonth = day.padStart(2, '0');
        const paddedDay = month.padStart(2, '0');
        return `${year}-${paddedMonth}-${paddedDay}`;
      }
      
      // Default to DD-MM-YYYY (European format) as that's what the error shows
      const paddedDay = day.padStart(2, '0');
      const paddedMonth = month.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
  }
  
  // Try to parse various other formats and convert to YYYY-MM-DD
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0] || `${new Date().getFullYear()}-01-01`;
  }
  
  // Fallback: assume current year if parsing fails
  const currentYear = new Date().getFullYear();
  return `${currentYear}-01-01`;
}

export { convertToAmadeusDate };

export async function searchFlights(input: {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  passengers?: number;
  cabinClass?: string;
}): Promise<{ ok: true; summary: string; source: string } | { ok: false; reason: string }> {
  // Validation is now handled in graph.ts, but we'll keep a basic check
  if (!input.origin || !input.destination || !input.departureDate) {
    return { ok: false, reason: 'missing_required_fields' };
  }

  // Convert city names to IATA codes
  const originCode = await getIataCode(input.origin);
  const destinationCode = await getIataCode(input.destination);

  // Convert dates to Amadeus format (YYYY-MM-DD)
  const formattedDepartureDate = convertToAmadeusDate(input.departureDate);
  const formattedReturnDate = input.returnDate ? convertToAmadeusDate(input.returnDate) : undefined;

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
    return result;
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
