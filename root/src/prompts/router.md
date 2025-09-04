**Task:** Return STRICT JSON only. Classify intent and extract CLEAN slots.

**Intents:**
- `weather`: current weather, temperature, climate conditions, forecast (e.g., "What's the weather like in Paris?", "How hot is it in Tokyo?")
- `destinations`: where to go, travel recommendations, trip planning (e.g., "Where should I go in June?", "Best places to visit")
- `packing`: what to pack/bring/wear for travel (e.g., "What should I pack for London?", "What to wear in winter?")
- `attractions`: what to do/see/visit in a city (e.g., "What to do in Rome?", "Best museums in Paris")
- `unknown`: if unclear OR completely unrelated to travel (philosophy, programming, medicine, cooking, etc.)

**Examples:**
```json
{"intent": "weather", "city": "Paris", "dates": null, "month": null}
{"intent": "weather", "city": "New York", "dates": "June", "month": "June"}
{"intent": "weather", "city": "Paris", "dates": "June", "month": "June"}
{"intent": "weather", "city": "Barcelona", "dates": "summer", "month": null}
{"intent": "weather", "city": "London", "dates": "December", "month": "December"}
{"intent": "packing", "city": "Tokyo", "dates": "March", "month": "March"}  
{"intent": "destinations", "city": null, "dates": "June", "month": "June"}
{"intent": "attractions", "city": "London", "dates": null, "month": null}
```

**Key Distinctions:**
- Weather queries ask about temperature, climate, or weather conditions - EVEN WITH DATES/MONTHS
- "June weather in New York", "Paris in June", "summer weather" are ALL weather intent
- Destinations queries ask about where to go or travel recommendations
- Weather queries do NOT require dates - they can provide current weather

**Slot Rules:**
- Extract ONLY the city name (no verbs or prepositions): "weather in Tokyo" → city: "Tokyo".
- Normalize common abbreviations: "NYC" → "New York City".
- Extract time references: "in June", "March", "summer" → dates/month. Leave null if not mentioned.

Slots (optional): { city, month, dates, travelerProfile }

CRITICAL RULES for slot extraction:
- City: Extract ONLY the city name; remove surrounding words like "pack for", "weather in", "do in".
  Examples: "pack for Paris in June" → city: "Paris"; "weather in Tokyo" → city: "Tokyo"; "what to do in London" → city: "London".
- Dates: Extract seasons, months, or date ranges.
  Examples: "in winter" → dates: "winter"; "in June" → dates: "June", month: "June"; "June 24-28" → dates: "June 24-28", month: "June".
- Normalize to API‑ready forms. Use context slots if provided to fill missing parts.
- If month or explicit date range present for destinations/packing, set needExternal=true.
- Confidence in [0..1]. Use <=0.5 when unsure; choose "unknown" when unclear or unrelated.

Output (strict JSON only):
{"intent":"destinations|packing|attractions|weather|unknown","needExternal":true|false,
 "slots":{"city":"CLEAN_CITY_NAME","month":"...","dates":"...","travelerProfile":"..."},"confidence":0..1,
 "missingSlots":["city"|"dates"|"month"...]}

Notes:
- Use provided "Known slots from context" to fill missing values across turns.
- "bring" and "pack" are strong indicators of packing intent.
- NEVER include action words in city names - extract pure city names only.
- Weather queries asking "what's the weather like" or "how hot/cold is it" should be classified as weather, not destinations.

