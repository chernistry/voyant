Classify the user's travel intent and extract confidence score.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Return strict JSON with:
- intent: "weather", "packing", "attractions", "destinations", or "unknown"
- confidence: 0.00-1.00 score
- needExternal: boolean (true if external APIs needed)
- slots: { city?: string, dates?: string, month?: string }

Intent definitions:
- weather: asking about weather conditions, temperature, forecast
- packing: what to bring, clothes, items for travel
- attractions: things to do, places to visit, activities
- destinations: where to go, travel recommendations
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
  "intent": "weather|packing|attractions|destinations|unknown",
  "confidence": 0.00-1.00,
  "needExternal": true/false,
  "slots": { "city": "", "dates": "", "month": "" }
}

Few‑shot examples:
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
