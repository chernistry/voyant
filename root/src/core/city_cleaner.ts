// Simple city name cleaner to fix the critical regression
export function cleanCityName(rawCity: string): string {
  if (!rawCity) return '';
  
  // Remove common prefixes that contaminate city names
  let cleaned = rawCity
    .replace(/^(pack for|do in|see in|weather in|to|in|for|from)\s+/i, '')
    .replace(/\s+(in|on|for|during)\s+(winter|summer|spring|fall|autumn|\w+)$/i, '') // Remove trailing seasons/months
    .replace(/\s+\d{4}$/, '') // Remove trailing years like "2024"
    .trim();
  
  // Handle common abbreviations
  const abbreviations: Record<string, string> = {
    'NYC': 'New York',
    'SF': 'San Francisco', 
    'LA': 'Los Angeles',
    'BOS': 'Boston',
    'Москва': 'Moscow',
    'Питер': 'Saint Petersburg',
    'СПб': 'Saint Petersburg',
  };
  
  const abbreviation = abbreviations[cleaned];
  if (abbreviation) {
    return abbreviation;
  }
  
  // Clean up any remaining artifacts
  cleaned = cleaned
    .replace(/^(pack|weather|do|see|visit|go|travel)\s+/i, '')
    .replace(/\s+(pack|weather|do|see|visit|go|travel)$/i, '')
    .trim();
  
  return cleaned;
}

// Extract season/time information from text
export function extractSeason(text: string): string {
  const seasonMatch = text.match(/\b(winter|summer|spring|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
  return seasonMatch?.[1] || '';
}

// Extract clean city from various text patterns
export function extractCleanCity(text: string): string {
  // Try different patterns to extract city
  const patterns = [
    /\b(?:in|to|for|from)\s+([A-Z][A-Za-z\- ]+(?:\s+[A-Z][A-Za-z\- ]+)*)/,
    /\b([A-Z][A-Za-z\- ]+(?:\s+[A-Z][A-Za-z\- ]+)*)\s+(?:in|on|for|during)\s+\w+/,
    /(?:pack|weather|visit|go|travel)\s+(?:for|to|in)\s+([A-Z][A-Za-z\- ]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const rawCity = match[1].split(/[.,!?]/)[0]?.trim();
      if (rawCity) {
        return cleanCityName(rawCity);
      }
    }
  }
  
  return '';
}
