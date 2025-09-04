Extract the city name from the user's travel-related message.

Rules:
- Return only the clean city name, no prefixes/suffixes
- Handle abbreviations (NYC → New York, SF → San Francisco, LA → Los Angeles)
- Support multilingual city names (Moscow, Москва, etc.)
- If no city found, return empty string
- Remove contaminating words like "pack for", "weather in", etc.

Examples:
- "What's the weather in Paris?" → "Paris"
- "Pack for NYC in winter" → "New York"
- "What to do in San Francisco?" → "San Francisco"
- "Москва weather" → "Moscow"
- "Tell me about travel" → ""

User message: {message}

City name:
