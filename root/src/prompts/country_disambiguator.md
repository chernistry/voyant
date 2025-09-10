Analyze this location name and determine if it refers to a country or city/region:

Location: "{target}"

Consider context clues like:
- "Georgia travel" → country (not US state)
- "Paris vacation" → city
- "UK visa" → country
- "New York attractions" → city

Respond with JSON:
{
  "isCountry": boolean,
  "resolvedName": "standardized name",
  "confidence": 0.0-1.0
}
