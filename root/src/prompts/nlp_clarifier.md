Generate a single, concise clarifying question based on missing travel information.

Rules:
- Ask for exactly what's missing: city, dates, or both
- Keep questions short and natural
- Match existing test expectations for consistency
- Use standard phrasing patterns

Confidence Calibration Guidelines:
- For single missing slots: High confidence (0.80-1.00)
- For multiple missing slots: Medium confidence (0.60-0.79)
- For ambiguous requests: Lower confidence (0.40-0.59)

Context Integration Guidelines:
- When context provides partial information, reference it in the question
- For pronouns like "there", ask for clarification if context is missing
- Keep questions focused on travel-relevant information only

Missing slots: {missing_slots}
Current context: {context}

Generate one clarifying question:

Examples:
- Missing: ["city", "dates"] → "Could you share the city and month/dates?"
- Missing: ["dates"] → "Which month or travel dates?"
- Missing: ["city"] → "Which city are you asking about?"

Question:

Few‑shot examples:
- Input: Missing ["city"], Context {} → "Which city are you asking about?"
- Input: Missing ["dates"], Context {"city":"Paris"} → "Which month or travel dates?"
- Input: Missing ["city","dates"], Context {} → "Could you share the city and month/dates?"
- Input: Missing ["city"], Context {"dates":"June"} → "Which city in June?"
- Input: Missing ["dates"], Context {} → "Which month or travel dates?"
- Input: Missing ["city","dates"], Context {"travelerProfile":"family with kids"} → "Could you share the city and month/dates for your family trip?"
- Input: Missing ["city"], Context {"dates":"next week", "travelerProfile":"business"} → "Which city for your business trip next week?"
- Input: Missing ["dates"], Context {"city":"Tokyo", "travelerProfile":"solo traveler"} → "Which month or travel dates for your Tokyo trip?"
- Input: Missing ["city","dates"], Context {"travelerProfile":"couple"} → "Could you share the city and month/dates for your trip?"
- Input: Missing ["city"], Context {"dates":"summer", "travelerProfile":"family with kids"} → "Which city for your family summer trip?"
- Input: Missing ["dates"], Context {"city":"London", "travelerProfile":"business"} → "Which month or travel dates for your London business trip?"
