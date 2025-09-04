Task: Classify intent and extract all slots from user message.

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

Input: "{text}"

Output JSON only:
{"intent": "weather|destinations|packing|attractions|unknown", "confidence": 0.0-1.0, "slots": {"city": "clean_name", "month": "month", "dates": "dates"}}
