Task: Extract and normalize date/time information from text.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema. Do not add comments or extra fields.
- Round `confidence` to two decimals.

Rules:
- Support formats: "June 2024", "June 24-28", "next week", "15-20 июня", "March", "March.", "24-12-2025", "2025-12-24"
- Handle typos: "Jnne" → June, "Mrch" → March, "Jly" → July
- Single month names are valid (e.g., "March" → March, "June." → June)
- Normalize to consistent format
- Extract month names in any language
- Return confidence based on specificity
- If NO dates/months mentioned, return confidence 0.0
- Do NOT fabricate dates that aren't in the text

Confidence Calibration Guidelines:
- 0.90-1.00: Specific date ranges or exact months
- 0.70-0.89: General time references (summer, winter, next week)
- 0.50-0.69: Single months or seasons
- 0.20-0.49: Ambiguous or vague time references
- 0.00-0.19: No clear time reference

Typo Handling Guidelines:
- Common typos should be corrected with slightly reduced confidence
- If multiple corrections are possible, use lower confidence (0.50-0.69)
- Very unclear typos should result in low confidence or 0.0

Input: "{text}"
Context: {context}

Output JSON only:
{"dates": "normalized_date_string", "month": "month_name", "confidence": 0.00-1.00}

Examples:
- Input: "June 24-28" → {"dates":"June 24-28","month":"June","confidence":0.95}
- Input: "next week" → {"dates":"next week","month":"","confidence":0.70}
- Input: "today" → {"dates":"today","month":"","confidence":0.95}
- Input: "tomorrow" → {"dates":"tomorrow","month":"","confidence":0.95}
- Input: "15-20 июня" → {"dates":"15-20 June","month":"June","confidence":0.85}
- Input: "Jnne 2025" → {"dates":"June 2025","month":"June","confidence":0.80}
- Input: "this weekend" → {"dates":"this weekend","month":"","confidence":0.65}
- Input: "sometime" → {"dates":"sometime","month":"","confidence":0.30}
- Input: "Mrch" → {"dates":"March","month":"March","confidence":0.80}
- Input: "Jly" → {"dates":"July","month":"July","confidence":0.80}
- Input: "Febuary" → {"dates":"February","month":"February","confidence":0.75}
- Input: "Septemer" → {"dates":"September","month":"September","confidence":0.75}
- Input: "Octorber" → {"dates":"October","month":"October","confidence":0.75}
- Input: "Novemebr" → {"dates":"November","month":"November","confidence":0.75}
- Input: "Decemer" → {"dates":"December","month":"December","confidence":0.75}
- Input: "Janury" → {"dates":"January","month":"January","confidence":0.75}
- Input: "24-12-2025" → {"dates":"December 24, 2025","month":"December","confidence":0.95}
- Input: "2025-12-24" → {"dates":"December 24, 2025","month":"December","confidence":0.95}
- Input: "Augest" → {"dates":"August","month":"August","confidence":0.75}
- Input: "Aprill" → {"dates":"April","month":"April","confidence":0.75}
- Input: "12th of October" → {"dates":"October 12","month":"October","confidence":0.90}
- Input: "October 12" → {"dates":"October 12","month":"October","confidence":0.95}
- Input: "12-10-2025" → {"dates":"October 12, 2025","month":"October","confidence":0.95}
- Input: "24th september 2025" → {"dates":"September 24, 2025","month":"September","confidence":0.95}
