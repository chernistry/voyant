Task: Extract and normalize date/time information from text.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

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
{"dates": "normalized_date_string", "month": "month_name", "confidence": 0.00-1.00}

Examples:
- Input: "June 24-28" → {"dates":"June 24-28","month":"June","confidence":0.95}
- Input: "next week" → {"dates":"next week","month":"","confidence":0.70}
- Input: "15-20 июня" → {"dates":"15-20 June","month":"June","confidence":0.85}
