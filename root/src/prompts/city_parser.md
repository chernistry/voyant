Task: Extract and normalize city name from text.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Rules:
- Extract city from phrases: "Weather in Moscow", "Погода в Москве", "Things to do in Paris"
- Handle prepositions: "in", "в", "to", "для", "from", "из"
- Handle pronouns with context: "there"→use context city, "here"→use context city
- Normalize common abbreviations: NYC→New York, SF→San Francisco, LA→Los Angeles
- Handle multilingual: Москва→Moscow, Питер→Saint Petersburg
- Return confidence 0.9+ for clear cities, 0.5-0.8 for ambiguous, <0.5 for unclear
- If NO city is mentioned in the text, return confidence 0.0

Confidence Calibration Guidelines:
- 0.90-1.00: Clear city name with strong signal
- 0.70-0.89: Clear city but with some ambiguity or context dependency
- 0.50-0.69: Ambiguous city reference that could be multiple locations
- 0.20-0.49: Weak city signal or potential false positive
- 0.00-0.19: No clear city reference

Pronoun Handling Guidelines:
- When "there" or "here" is used, confidence should reflect the certainty of the context match
- If context has a city, use 0.70-0.80 for pronoun resolution
- If context is missing or unclear, use 0.20-0.40 for pronouns

Input: "{text}"
Context: {context}

Output JSON only:
{"city": "clean_city_name", "normalized": "normalized_name", "confidence": 0.00-1.00}

Few‑shot examples:
- Input: "Weather in NYC" | Context: {} → {"city":"New York","normalized":"New York","confidence":0.95}
- Input: "Что делать в Питере?" | Context: {} → {"city":"Saint Petersburg","normalized":"Saint Petersburg","confidence":0.90}
- Input: "Go there in summer" | Context: {"city":"Tokyo"} → {"city":"Tokyo","normalized":"Tokyo","confidence":0.70}
- Input: "What to do there?" | Context: {} → {"city":"","normalized":"","confidence":0.30}
- Input: "is it hot?" | Context: {"city":"Paris"} → {"city":"Paris","normalized":"Paris","confidence":0.60}
- Input: "Погода в Москве" | Context: {} → {"city":"Moscow","normalized":"Moscow","confidence":0.95}
- Input: "I love it here" | Context: {"city":"London"} → {"city":"London","normalized":"London","confidence":0.75}
- Input: "What's the weather like there?" | Context: {"city":"Berlin"} → {"city":"Berlin","normalized":"Berlin","confidence":0.70}
- Input: "Can you tell me about here?" | Context: {} → {"city":"","normalized":"","confidence":0.25}
- Input: "Is it crowded there in June?" | Context: {"city":"Rome"} → {"city":"Rome","normalized":"Rome","confidence":0.80}
- Input: "Tell me more about that place" | Context: {"city":"Madrid"} → {"city":"Madrid","normalized":"Madrid","confidence":0.65}
- Input: "What should I do in that city?" | Context: {"city":"Barcelona"} → {"city":"Barcelona","normalized":"Barcelona","confidence":0.85}
