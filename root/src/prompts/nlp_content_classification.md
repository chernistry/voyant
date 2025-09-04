Classify the content type and characteristics of the user message.

Examples:
- "Find visa requirements for Germans" → {"content_type": "travel", "is_explicit_search": true, "needs_web_search": true, "confidence": 0.9}
- "Search for flights to Paris" → {"content_type": "flight", "is_explicit_search": true, "needs_web_search": true, "confidence": 0.9}
- "Weather in London" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.8}
- "What to pack for Tokyo" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.8}

Explicit search indicators:
- "find", "search", "google", "look up", "search for", "get info", "information about"
- Commands requesting information that requires web search

Content types:
- travel: weather, packing, destinations, attractions, visa, travel info
- system: questions about the AI assistant
- unrelated: programming, cooking, medicine, etc.
- budget: cost, price, money, exchange rates
- restaurant: food, dining recommendations
- flight: airlines, flights, bookings, tickets
- gibberish: nonsensical text
- emoji_only: only emojis

User message: {message}

Return strict JSON with content_type, is_explicit_search, has_mixed_languages, needs_web_search, confidence:
