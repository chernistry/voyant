Classify the user's travel intent and extract confidence score.

Return strict JSON with:
- intent: "weather", "packing", "attractions", "destinations", "web_search", or "unknown"
- confidence: 0.0-1.0 score
- needExternal: boolean (true if external APIs needed)

Intent definitions:
- weather: asking about weather conditions, temperature, forecast
- packing: what to bring, clothes, items for travel
- attractions: things to do, places to visit, activities
- destinations: where to go, travel recommendations
- web_search: explicit search requests ("search for", "google", etc.)
- unknown: unclear, unrelated, or insufficient information

User message: {message}
Context: {context}

Return strict JSON:
