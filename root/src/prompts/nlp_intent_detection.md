Classify the user's travel intent and extract confidence score.

Return strict JSON with:
- intent: "weather", "packing", "attractions", "destinations", "web_search", or "unknown"
- confidence: 0.0-1.0 score
- needExternal: boolean (true if external APIs needed)
 - slots: { city?: string, dates?: string, month?: string }

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
{
  "intent": "weather|packing|attractions|destinations|web_search|unknown",
  "confidence": 0..1,
  "needExternal": true/false,
  "slots": { "city": "", "dates": "", "month": "" }
}

Few‑shot examples:
Input: "weather in NYC in June"
Output: {"intent":"weather","confidence":0.9,"needExternal":true,"slots":{"city":"New York City","month":"June","dates":"June"}}

Input: "what to pack for Tokyo in March"
Output: {"intent":"packing","confidence":0.85,"needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"}}
