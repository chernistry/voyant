Extract origin and destination cities from this text. Return JSON with
originCity and destinationCity fields (null if not found) and confidence (0-1).

Text: "{text}"
Context: {context}

Look for patterns like:
- "from X" or "leaving X" = origin
- "to Y" or "in Y" = destination

Return only valid JSON.
