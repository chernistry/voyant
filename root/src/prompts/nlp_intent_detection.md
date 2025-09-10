Classify the user's travel intent and extract confidence score.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Return strict JSON with:
- intent: "weather", "packing", "attractions", "destinations", "flights", or "unknown"
- confidence: 0.00-1.00 score
- needExternal: boolean (true if external APIs needed)
- slots: { city?: string, dates?: string, month?: string, originCity?: string, destinationCity?: string, departureDate?: string, returnDate?: string, passengers?: number, cabinClass?: string }

Date extraction rules:
- Extract dates in natural language format (e.g., "October 12", "next month", "March 2025")
- Use departureDate/returnDate for flight-related queries
- Use dates/month for general travel queries
- ALWAYS extract BOTH originCity and destinationCity from "from X to Y" patterns

Intent definitions:
- weather: asking about weather conditions, temperature, forecast
- packing: what to bring, clothes, items for travel
- attractions: things to do, places to visit, activities
- destinations: where to go, travel recommendations
- flights: flight search, booking, schedules, prices, airlines
- unknown: unclear, unrelated, or insufficient information

Explicit search mapping (Option A alignment):
- If the message explicitly asks to search (e.g., "search for", "google", "look up", "find info") or requests live data (events, restaurants, hotels, safety, transport, prices, visas, flights), keep intent within the allowed set (usually "unknown" or the closest domain) and set needExternal=true.

Confidence Calibration Guidelines:
- 0.80-1.00: Clear intent with strong signal words
- 0.50-0.79: Clear intent but with some ambiguity
- 0.20-0.49: Ambiguous intent that could belong to multiple categories
- 0.00-0.19: No clear travel-related intent detected

User message: {message}
Context: {context}

Return strict JSON:
{
  "intent": "weather|packing|attractions|destinations|flights|unknown",
  "confidence": 0.00-1.00,
  "needExternal": true/false,
  "slots": { "city": "", "dates": "", "month": "", "originCity": "", "destinationCity": "", "departureDate": "", "returnDate": "", "passengers": 0, "cabinClass": "" }
}

Few‑shot examples:

FLIGHTS (extract natural language dates):
Input: "flights from NYC to London on March 15"
Output: {"intent":"flights","confidence":0.95,"needExternal":true,"slots":{"originCity":"New York City","destinationCity":"London","departureDate":"March 15","passengers":1}}

Input: "Find me flights from Moscow to Obzor 24th september 2025"
Output: {"intent":"flights","confidence":0.95,"needExternal":true,"slots":{"originCity":"Moscow","destinationCity":"Obzor","departureDate":"24th september 2025","passengers":1}}

Input: "flights from tel aviv to moscow september 24 2025 one way"
Output: {"intent":"flights","confidence":0.95,"needExternal":true,"slots":{"originCity":"Tel Aviv","destinationCity":"Moscow","departureDate":"september 24 2025","passengers":1}}

Input: "flights from moscow to tel aviv 12-10-2025 one way"
Output: {"intent":"flights","confidence":0.95,"needExternal":true,"slots":{"originCity":"Moscow","destinationCity":"Tel Aviv","departureDate":"12-10-2025","passengers":1}}

Input: "business class flights from LAX to Paris on December 1st 2025"
Output: {"intent":"flights","confidence":0.92,"needExternal":true,"slots":{"originCity":"Los Angeles","destinationCity":"Paris","departureDate":"December 1st 2025","cabinClass":"business","passengers":1}}

Input: "find me a round trip flight to Tokyo next month"
Output: {"intent":"flights","confidence":0.90,"needExternal":true,"slots":{"destinationCity":"Tokyo","dates":"next month","passengers":1}}

NON-FLIGHTS (use natural language):
Input: "weather in London in March"
Output: {"intent":"weather","confidence":0.95,"needExternal":true,"slots":{"city":"London","month":"March"}}

Input: "what to pack for Tokyo in December 2025"
Output: {"intent":"packing","confidence":0.92,"needExternal":false,"slots":{"city":"Tokyo","dates":"December 2025"}}

Input: "weather in NYC in June"
Output: {"intent":"weather","confidence":0.90,"needExternal":true,"slots":{"city":"New York City","month":"June","dates":"June"}}

Input: "what to pack for Tokyo in March"
Output: {"intent":"packing","confidence":0.85,"needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"}}

Input: "Make it kid-friendly"
Output: {"intent":"destinations","confidence":0.75,"needExternal":false,"slots":{}}

Input: "Make it more budget-friendly"
Output: {"intent":"destinations","confidence":0.75,"needExternal":false,"slots":{}}

Input: "Add family activities"
Output: {"intent":"attractions","confidence":0.75,"needExternal":false,"slots":{}}

Input: "Any festivals or events that week we should plan around?"
Output: {"intent":"unknown","confidence":0.90,"needExternal":true,"slots":{}}

Input: "is it hot?" (ambiguous)
Output: {"intent":"unknown","confidence":0.30,"needExternal":false,"slots":{"city":""}}

Input: "что взять в Токио в марте" (Russian)
Output: {"intent":"packing","confidence":0.80,"needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"}}

Edge Cases:
Input: "I need to find..." (incomplete)
Output: {"intent":"unknown","confidence":0.40,"needExternal":true,"slots":{}}

Input: "help me plan a trip" (very general)
Output: {"intent":"destinations","confidence":0.60,"needExternal":false,"slots":{}}

Input: "what should I do?" (ambiguous, no context)
Output: {"intent":"unknown","confidence":0.25,"needExternal":false,"slots":{}}

Input: "is it sunny?" (weather-related but missing location)
Output: {"intent":"unknown","confidence":0.35,"needExternal":true,"slots":{"city":""}}

Input: "where can I go?" (destination-related but missing details)
Output: {"intent":"destinations","confidence":0.55,"needExternal":false,"slots":{}}

Input: "what should I wear?" (packing-related but missing location)
Output: {"intent":"unknown","confidence":0.40,"needExternal":false,"slots":{}}

Input: "any good places?" (attraction-related but missing location)
Output: {"intent":"unknown","confidence":0.30,"needExternal":false,"slots":{}}

Input: "how much does it cost?" (budget-related but missing specifics)
Output: {"intent":"unknown","confidence":0.45,"needExternal":true,"slots":{}}
