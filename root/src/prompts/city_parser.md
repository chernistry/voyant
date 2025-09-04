Task: Extract and normalize city name from text.

Rules:
- Extract city from phrases: "Weather in Moscow", "Погода в Москве", "Things to do in Paris"
- Handle prepositions: "in", "в", "to", "для", "from", "из"
- Handle pronouns with context: "there"→use context city, "here"→use context city
- Normalize common abbreviations: NYC→New York, SF→San Francisco, LA→Los Angeles
- Handle multilingual: Москва→Moscow, Питер→Saint Petersburg
- Return confidence 0.9+ for clear cities, 0.5-0.8 for ambiguous, <0.5 for unclear
- If NO city is mentioned in the text, return confidence 0.0

Input: "{text}"
Context: {context}

Output JSON only:
{"city": "clean_city_name", "normalized": "normalized_name", "confidence": 0.0-1.0}
