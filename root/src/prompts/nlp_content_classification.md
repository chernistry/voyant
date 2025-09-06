Classify the content type and characteristics of the user message.

Examples:
- "Hey can you help plan a trip?" → {"content_type": "system", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}
- "From NYC, end of June. Ideas?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}
- "What should we pack?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}
- "What can you do?" → {"content_type": "system", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}
- "Find visa requirements for Germans" → {"content_type": "travel", "is_explicit_search": true, "needs_web_search": true, "confidence": 0.9}
- "Search for flights to Paris" → {"content_type": "flight", "is_explicit_search": true, "needs_web_search": true, "confidence": 0.9}
- "Any festivals or events that week?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": true, "confidence": 0.9}
- "What concerts are happening in Boston?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": true, "confidence": 0.9}
- "Weather in London" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.8}
- "What to pack for Tokyo" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.8}
- "What is United baggage allowance?" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}
- "Marriott cancellation policy" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "confidence": 0.9}

System questions (about the AI assistant):
- "can you help", "what can you do", "who are you", "how do you work", "tell me about yourself"
- Questions about AI capabilities, identity, or functionality
- Requests for help or assistance without specific travel details

Travel requests (destinations, recommendations, packing, weather):
- "ideas", "suggestions", "recommendations", "where should I go", "what should I visit"
- "what should we pack", "what to pack", "packing list", "what to bring"
- "weather", "temperature", "forecast"
- Requests with origin/dates asking for destination ideas
- NOT explicit search unless using search command words

Policy questions (airline/hotel/visa policies):
- "baggage allowance", "cancellation policy", "change fee", "refund policy"
- "visa requirements", "entry requirements", "passport", "check-in policy"
- Questions about specific company policies (United, Marriott, etc.)
- NOT explicit search - these use internal policy documents

Explicit search indicators:
- "find", "search", "google", "look up", "search for", "get info", "information about"
- Commands requesting information that requires web search
- NOT basic travel questions like packing, weather, attractions

Content types:
- system: questions about the AI assistant itself or requests for help
- travel: weather, packing, destinations, attractions, events, visa, travel info
- policy: airline/hotel/visa policies, baggage, cancellation, refund rules
- unrelated: programming, cooking, medicine, etc.
- budget: cost, price, money, exchange rates
- restaurant: food, dining recommendations
- flight: airlines, flights, bookings, tickets
- gibberish: nonsensical text
- emoji_only: only emojis

User message: {message}

Return strict JSON with content_type, is_explicit_search, has_mixed_languages, needs_web_search, confidence:
