Task: Return STRICT JSON only. Classify intent and extract CLEAN slot values.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.
- Do not use a `web_search` intent. If the user explicitly asks for searches (events, restaurants, flights, visas, prices), keep `intent` within the allowed set and set `needExternal`=true.

{instructions}

{context}

User: {message}

Output (strict JSON only):
{
  "intent": "destinations|packing|attractions|weather|unknown",
  "needExternal": true|false,
  "slots": {"city": "CLEAN_CITY_NAME", "month": "...", "dates": "...", "travelerProfile": "..."},
  "confidence": 0.00-1.00,
  "missingSlots": ["city"|"dates"|"month"|...]
}

Confidence Calibration Guidelines:
- 0.80-1.00: Clear intent with all required slots present
- 0.50-0.79: Clear intent but with some missing or ambiguous slots
- 0.20-0.49: Ambiguous intent that could belong to multiple categories
- 0.00-0.19: No clear travel-related intent detected

Few‑shot examples:
Input: "summer weather in Barcelona"
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Barcelona","dates":"summer"},"confidence":0.82,"missingSlots":[]}

Input: "what should I pack for SF?"
Output: {"intent":"packing","needExternal":false,"slots":{"city":"San Francisco"},"confidence":0.78,"missingSlots":[]}

Input: "what should I do there?" (with context: {"city": "Rome"})
Output: {"intent":"attractions","needExternal":false,"slots":{"city":"Rome"},"confidence":0.70,"missingSlots":[]}

Input: "is it hot?" (ambiguous)
Output: {"intent":"unknown","needExternal":false,"slots":{},"confidence":0.30,"missingSlots":["city"]}

Input: "best places to visit in June from NYC"
Output: {"intent":"destinations","needExternal":true,"slots":{"city":"New York City","month":"June","dates":"June"},"confidence":0.85,"missingSlots":[]}

Input: "what's the weather like?" (with context: {"city": "Paris"})
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Paris"},"confidence":0.80,"missingSlots":[]}

Input: "any good restaurants there?" (with context: {"city": "Tokyo"})
Output: {"intent":"unknown","needExternal":true,"slots":{"city":"Tokyo"},"confidence":0.65,"missingSlots":[]}

Input: "what should we do?" (ambiguous, no context)
Output: {"intent":"unknown","needExternal":false,"slots":{},"confidence":0.25,"missingSlots":["city"]}

Input: "is it raining?" (with context: {"city": "London"})
Output: {"intent":"weather","needExternal":true,"slots":{"city":"London"},"confidence":0.75,"missingSlots":[]}

Fallback guidelines:
- If ambiguous, lower confidence ≤0.5 and list "missingSlots".
- Prefer simple city names; normalize abbreviations (NYC→New York City, SF→San Francisco, LA→Los Angeles).
- Use provided context slots to fill gaps when user refers to "here/there".
- When context slots are used, confidence should reflect the certainty of the context match.
- For multilingual inputs, translate internally but preserve location names; confidence may be slightly lower for non-English inputs.
