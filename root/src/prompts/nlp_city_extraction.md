Extract the city name from the user's travel-related message.

Rules:
- Return only the clean city name, no prefixes/suffixes
- Handle abbreviations (NYC → New York, SF → San Francisco, LA → Los Angeles)
- Support multilingual city names (Moscow, Москва, etc.)
- If no city found, return empty string
- Remove contaminating words like "pack for", "weather in", etc.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear city name with strong context
- Medium confidence (0.50-0.79): City name with some ambiguity
- Low confidence (0.20-0.49): Weak or potential city reference
- Very low confidence (0.00-0.19): No clear city reference

Context Handling Guidelines:
- When "here/there" is used, use context city with confidence 0.70-0.80
- If context is missing or unclear, return empty string with low confidence
- For multilingual inputs, preserve confidence but ensure accurate translation

Examples:
- "What's the weather in Paris?" → "Paris"
- "Pack for NYC in winter" → "New York"
- "What to do in San Francisco?" → "San Francisco"
- "Москва weather" → "Moscow"
- "Tell me about travel" → ""

User message: {message}

City name:

Edge cases:
- If message contains no location, return an empty string.
- If message says "here/there" and context has city, prefer context city.
- For ambiguous references like "there", use context when available.
- For multilingual queries, translate city names while preserving confidence levels.
