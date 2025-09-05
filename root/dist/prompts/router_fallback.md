Task: Return STRICT JSON only. Classify intent and extract CLEAN slot values.

{instructions}

{context}

User: {message}

Output (strict JSON only):
{
  "intent": "destinations|packing|attractions|weather|unknown",
  "needExternal": true|false,
  "slots": {"city": "CLEAN_CITY_NAME", "month": "...", "dates": "...", "travelerProfile": "..."},
  "confidence": 0..1,
  "missingSlots": ["city"|"dates"|"month"|...]
}

Few‑shot examples:
Input: "summer weather in Barcelona"
Output: {"intent":"weather","needExternal":true,"slots":{"city":"Barcelona","dates":"summer"},"confidence":0.82,"missingSlots":[]}

Input: "what should I pack for SF?"
Output: {"intent":"packing","needExternal":false,"slots":{"city":"San Francisco"},"confidence":0.78,"missingSlots":[]}

Fallback guidelines:
- If ambiguous, lower confidence ≤0.5 and list "missingSlots".
- Prefer simple city names; normalize abbreviations (NYC→New York City, SF→San Francisco, LA→Los Angeles).
- Use provided context slots to fill gaps when user refers to "here/there".
