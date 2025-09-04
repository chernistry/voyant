Task: Classify intent and extract slots. Return strict JSON only.

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

Few‑shot examples:
// Obvious weather
Input: "what's the weather in NYC in June?"
Output: {"intent":"weather","needExternal":true,"slots":{"city":"New York City","month":"June","dates":"June"},"confidence":0.9,"missingSlots":[]}

// Packing with time
Input: "what to pack for Tokyo in March"
Output: {"intent":"packing","needExternal":false,"slots":{"city":"Tokyo","month":"March","dates":"March"},"confidence":0.85,"missingSlots":[]}

// Attractions without city
Input: "what to do there?"
Output: {"intent":"attractions","needExternal":false,"slots":{},"confidence":0.4,"missingSlots":["city"]}
