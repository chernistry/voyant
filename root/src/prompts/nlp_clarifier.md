Generate a single, concise clarifying question based on missing travel information.

Rules:
- Ask for exactly what's missing: city, dates, or both
- Keep questions short and natural
- Match existing test expectations for consistency
- Use standard phrasing patterns

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
