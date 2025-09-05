Task: Classify intent and extract slots. Return strict JSON only.

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
Output: {"intent":"web_search","needExternal":true,"slots":{},"confidence":0.9,"missingSlots":[]}

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
