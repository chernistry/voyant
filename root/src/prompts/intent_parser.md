Task: Classify intent and extract all slots from user message.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Intents:
- "weather": temperature, climate, forecast (e.g., "What's the weather in Paris?", "Tokyo in March weather")
- "destinations": where to go, travel options/recommendations
- "packing": what to pack/bring/wear
- "attractions": what to do/see/visit
- "unknown": unclear or unrelated to travel

Rules:
- Extract clean slot values (city names without surrounding text)
- Handle multilingual queries
- Use previous context to fill missing information
- Return high confidence for clear intents
{contextInfo}

Confidence Calibration Guidelines:
- 0.80-1.00: Clear intent with strong signal words
- 0.50-0.79: Clear intent but with some ambiguity
- 0.20-0.49: Ambiguous intent that could belong to multiple categories
- 0.00-0.19: No clear travel-related intent detected

Input: "{text}"

Output JSON only:
{"intent": "weather|destinations|packing|attractions|unknown", "confidence": 0.00-1.00, "slots": {"city": "clean_name", "month": "month", "dates": "dates"}}

Few‑shot examples:
Input: "Weather in NYC in June"
Output: {"intent":"weather","confidence":0.90,"slots":{"city":"New York","month":"June","dates":"June"}}

Input: "что взять в Токио в марте"
Output: {"intent":"packing","confidence":0.85,"slots":{"city":"Tokyo","month":"March","dates":"March"}}

Input: "is it hot?" (ambiguous)
Output: {"intent":"unknown","confidence":0.30,"slots":{"city":"","month":"","dates":""}}

Input: "what should I do there?" (context dependent)
Context: {"city": "Rome"}
Output: {"intent":"attractions","confidence":0.70,"slots":{"city":"Rome","month":"","dates":""}}

Input: "best places to visit in summer" (partial information)
Output: {"intent":"destinations","confidence":0.65,"slots":{"city":"","month":"","dates":"summer"}}

Input: "what should I pack for my trip?" (general packing query)
Output: {"intent":"packing","confidence":0.55,"slots":{"city":"","month":"","dates":""}}

Input: "where should I go?" (general destination query)
Output: {"intent":"destinations","confidence":0.50,"slots":{"city":"","month":"","dates":""}}

Input: "help me plan" (very ambiguous)
Output: {"intent":"unknown","confidence":0.20,"slots":{"city":"","month":"","dates":""}}

Input: "Quel temps fait-il à Paris?" (French weather query)
Output: {"intent":"weather","confidence":0.85,"slots":{"city":"Paris","month":"","dates":""}}

Input: "What are the top attractions in London?" (clear attraction query)
Output: {"intent":"attractions","confidence":0.90,"slots":{"city":"London","month":"","dates":""}}
