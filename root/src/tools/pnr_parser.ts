import { PNRSchema, type PNR } from '../schemas/irrops.js';

export async function parsePNRFromText(
  input: string,
  signal?: AbortSignal
): Promise<PNR | null> {
  signal?.throwIfAborted();
  
  // Extract record locator (6 alphanumeric characters)
  const recordLocatorMatch = input.match(/\b[A-Z0-9]{6}\b/);
  if (!recordLocatorMatch) return null;

  // Extract passenger names (simplified pattern)
  const passengerMatches = input.match(/(?:MR|MS|MRS)\s+([A-Z\s]+)/g) || [];
  const passengers = passengerMatches.map(match => ({
    name: match.replace(/^(MR|MS|MRS)\s+/, ''),
    type: 'ADT' as const
  }));

  // Extract flight segments (simplified pattern)
  const flightPattern = /([A-Z]{2})(\d+)\s+([A-Z]{3})([A-Z]{3})\s+(\d{2}[A-Z]{3})/g;
  const segments: PNR['segments'] = [];
  let match;
  
  while ((match = flightPattern.exec(input)) !== null) {
    const [, carrier, flightNumber, origin, destination, dateStr] = match;
    
    if (!carrier || !flightNumber || !origin || !destination || !dateStr) continue;
    
    // Parse date (simplified - assumes current year)
    const date = parseDateString(dateStr);
    if (!date) continue;

    segments.push({
      origin,
      destination,
      departure: date.toISOString(),
      arrival: new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString(), // +2h estimate
      carrier,
      flightNumber: carrier + flightNumber,
      cabin: 'Y', // Default economy
      status: 'OK'
    });
  }

  if (segments.length === 0) return null;

  const pnr = {
    recordLocator: recordLocatorMatch[0],
    passengers: passengers.length > 0 ? passengers : [{ name: 'PASSENGER', type: 'ADT' as const }],
    segments
  };

  // Validate against schema
  const result = PNRSchema.safeParse(pnr);
  return result.success ? result.data : null;
}

export function parsePNRFromSlots(slots: Record<string, any>): PNR | null {
  if (!slots.recordLocator || !slots.segments) return null;
  
  const result = PNRSchema.safeParse({
    recordLocator: slots.recordLocator,
    passengers: slots.passengers || [{ name: 'PASSENGER', type: 'ADT' }],
    segments: slots.segments
  });
  
  return result.success ? result.data : null;
}

function parseDateString(dateStr: string): Date | null {
  // Parse format like "12JAN" 
  const match = dateStr.match(/(\d{2})([A-Z]{3})/);
  if (!match) return null;

  const [, day, monthStr] = match;
  if (!day || !monthStr) return null;
  
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months.indexOf(monthStr);
  
  if (month === -1) return null;
  
  const currentYear = new Date().getFullYear();
  return new Date(currentYear, month, parseInt(day));
}
