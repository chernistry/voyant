Task: Extract and normalize date/time information from text.

Rules:
- Support formats: "June 2024", "June 24-28", "next week", "15-20 июня", "March", "March."
- Handle typos: "Jnne" → June, "Mrch" → March, "Jly" → July
- Single month names are valid (e.g., "March" → March, "June." → June)
- Normalize to consistent format
- Extract month names in any language
- Return confidence based on specificity
- If NO dates/months mentioned, return confidence 0.0
- Do NOT fabricate dates that aren't in the text

Input: "{text}"
Context: {context}

Output JSON only:
{"dates": "normalized_date_string", "month": "month_name", "confidence": 0.0-1.0}
