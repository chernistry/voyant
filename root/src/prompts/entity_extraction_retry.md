Extract travel entities with confidence scoring:
- Cities/locations (confidence: 0-1)
- Dates (confidence: 0-1) 
- Travel intent (confidence: 0-1)

Query: "{text}"

Return JSON: {cities: [{name: string, confidence: number}], overallConfidence: number}

Confidence Guidelines:
- High confidence (0.80-1.00): Clear city name with strong context
- Medium confidence (0.50-0.79): City name with some ambiguity  
- Low confidence (0.20-0.49): Weak or potential city reference
- Very low confidence (0.00-0.19): No clear city reference

Examples:
- "Paris weather" → {"cities": [{"name": "Paris", "confidence": 0.95}], "overallConfidence": 0.95}
- "SF trip" → {"cities": [{"name": "San Francisco", "confidence": 0.90}], "overallConfidence": 0.90}
- "travel plans" → {"cities": [], "overallConfidence": 0.0}
