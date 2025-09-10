Task: Classify intent and extract slots. Return strict JSON only.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Guidelines:
- Use the output schema exactly. No extra keys. No comments.
- Normalize entities:
  - `intent` ∈ {"destinations","packing","attractions","weather","unknown"}
  - `city`: expand common abbreviations (e.g., NYC → New York City, LA → Los Angeles)
  - `month`: full month name (e.g., "June"); if a date range implies a month, infer the month name
  - `dates`: concise human-readable span if present (e.g., "2025-06-12 to 2025-06-18" or "June 2025")
  - `travelerProfile`: short phrase like "family with kids", "solo traveler", "couple", "business"
- `needExternal` is true when the user asks for current facts (weather now/forecast, prices, live events, visa rules); false for evergreen advice (packing lists, generic attractions without live data)
- Set `confidence` in [0,1]; use ≤0.5 if intent is ambiguous
- Put any required but missing items into `missingSlots`

Confidence Calibration Guidelines:
- 0.80-1.00: Clear intent with all required slots present
- 0.50-0.79: Clear intent but with some missing or ambiguous slots
- 0.20-0.49: Ambiguous intent that could belong to multiple categories
- 0.00-0.19: No clear travel-related intent detected

Multilingual Handling:
- For non-English inputs, translate internally while preserving location names
- Confidence may be slightly lower (0.1-0.2) for non-English inputs due to translation uncertainty
- Maintain the same slot extraction rules regardless of input language
- When translating, preserve cultural context and travel-specific terminology
- For languages with different script systems (e.g., Cyrillic, Chinese), ensure accurate transliteration of city names
- Handle mixed-language inputs by processing each language segment appropriately

{instructions}

User: {message}

Output schema (strict JSON only):
{
  "intent": "destinations|packing|attractions|weather|unknown",
  "needExternal": true|false,
  "slots": {"city": "...", "month": "...", "dates": "...", "travelerProfile": "..."},
  "confidence": 0..1,
  "missingSlots": ["city"|"dates"|"month"|...]
}

Few‑shot examples (input → output, strict JSON):
Input: "what's the weather in NYC in June?"
Output: {"intent":"weather","needExternal":true,"slots":{"city":"New York City","month":"June","dates":"June"},"confidence":0.9,"missingSlots":[]}

Input: "what to pack for Tokyo in March"
Output: {"intent":"packing","needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"},"confidence":0.85,"missingSlots":[]}

Input: "What to wear to Haifa today?"
Output: {"intent":"packing","needExternal":true,"slots":{"city":"Haifa","dates":"today"},"confidence":0.9,"missingSlots":[]}

Input: "What to wear to Hafia toda?"
Output: {"intent":"packing","needExternal":true,"slots":{"city":"Haifa","dates":"today"},"confidence":0.8,"missingSlots":[]}

Input: "Any festivals or events that week?"
Output: {"intent":"unknown","needExternal":true,"slots":{},"confidence":0.90,"missingSlots":[]}

Input: "what to do there?"
Output: {"intent":"attractions","needExternal":false,"slots":{},"confidence":0.4,"missingSlots":["city"]}

Input: "Best kid-friendly things in SF for late Aug?"
Output: {"intent":"attractions","needExternal":false,"slots":{"city":"San Francisco","month":"August","dates":"late August","travelerProfile":"family with kids"},"confidence":0.8,"missingSlots":[]}

Input: "Flights to Paris next weekend under $600?"
Output: {"intent":"destinations","needExternal":true,"slots":{"city":"Paris","dates":"next weekend"},"confidence":0.75,"missingSlots":["month"]}

Input: "Where to go from Tel Aviv in August?"
Output: {"intent":"destinations","needExternal":true,"slots":{"city":"Tel Aviv","month":"August","dates":"August"},"confidence":0.85,"missingSlots":[]}

Input: "Going to LA 10/12–10/15 for a conference—what should I bring?"
Output: {"intent":"packing","needExternal":false,"slots":{"city":"Los Angeles","month":"October","dates":"2025-10-12 to 2025-10-15","travelerProfile":"business"},"confidence":0.85,"missingSlots":[]}

Input: "что взять в Токио в марте" (Russian)
Output: {"intent":"packing","needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"},"confidence":0.80,"missingSlots":[]}

Input: "is it hot?" (ambiguous)
Output: {"intent":"unknown","needExternal":false,"slots":{},"confidence":0.30,"missingSlots":["city"]}

Input: "Quel temps fait-il à Paris?" (French)
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Paris"},"confidence":0.85,"missingSlots":[]}

Input: "Qué hacer en Madrid?" (Spanish)
Output: {"intent":"attractions","needExternal":false,"slots":{"city":"Madrid"},"confidence":0.80,"missingSlots":[]}

Input: "东京の天気は？" (Japanese)
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Tokyo"},"confidence":0.85,"missingSlots":[]}

Input: "Погода в Берлине" (Russian)
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Berlin"},"confidence":0.85,"missingSlots":[]}

Input: "Previsão do tempo em Lisboa" (Portuguese)
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Lisbon"},"confidence":0.80,"missingSlots":[]}
