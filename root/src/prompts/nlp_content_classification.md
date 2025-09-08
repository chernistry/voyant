Classify the content type and characteristics of the user message.

Hard requirements:
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- Use only the keys in the schema below. Do not add comments or extra fields.
- Round `confidence` to two decimals.
- `has_mixed_languages` is true when the message clearly contains multiple languages or scripts (e.g., Latin + Cyrillic); otherwise false.
- `categories` should include constraint categories detected in the message (e.g., budget, group, special, accommodation, transport, time, location, person).

Examples:
- "Hey can you help plan a trip?" → {"content_type": "system", "is_explicit_search": false, "needs_web_search": false, "categories": [], "confidence": 0.9}
- "From NYC, end of June. Ideas?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["location", "time"], "confidence": 0.9}
- "Where should I go in June from NYC?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["location", "time"], "confidence": 0.9}
- "What should we pack?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": [], "confidence": 0.9}
- "Make it kid-friendly" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["group"], "confidence": 0.9}
- "Make it family-friendly" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["group"], "confidence": 0.9}
- "What can you do?" → {"content_type": "system", "is_explicit_search": false, "needs_web_search": false, "categories": [], "confidence": 0.9}
- "Find visa requirements for Germans" → {"content_type": "travel", "is_explicit_search": true, "needs_web_search": true, "categories": ["special"], "confidence": 0.9}
- "Search for flights to Paris" → {"content_type": "flight", "is_explicit_search": true, "needs_web_search": true, "categories": ["transport", "location"], "confidence": 0.9}
- "Any festivals or events that week?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": true, "categories": ["time"], "confidence": 0.9}
- "What concerts are happening in Boston?" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": true, "categories": ["location"], "confidence": 0.9}
- "Weather in London" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["location"], "confidence": 0.8}
- "What to pack for Tokyo" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["location"], "confidence": 0.8}
- "What is United baggage allowance?" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "categories": ["special"], "confidence": 0.9}
- "Marriott cancellation policy" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "categories": ["special"], "confidence": 0.9}
- "Delta risk-free cancellation policy" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "categories": ["special"], "confidence": 0.9}
- "What is the timeframe for Delta's cancellation policy?" → {"content_type": "policy", "is_explicit_search": false, "needs_web_search": false, "categories": ["special"], "confidence": 0.9}
- "I need a hotel in Paris for 2 adults and 2 kids next month" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["accommodation", "location", "group", "time"], "confidence": 0.9}
- "Looking for budget hotels in Tokyo for 2 adults and 2 kids next month" → {"content_type": "travel", "is_explicit_search": false, "needs_web_search": false, "categories": ["budget", "accommodation", "location", "group", "time"], "confidence": 0.9}

System questions (about the AI assistant):
- "can you help", "what can you do", "who are you", "how do you work", "tell me about yourself"
- Questions about AI capabilities, identity, or functionality
- Requests for help or assistance without specific travel details

Travel requests (destinations, recommendations, packing, weather):
- "ideas", "suggestions", "recommendations", "where should I go", "what should I visit"
- "what should we pack", "what to pack", "packing list", "what to bring"
- "weather", "temperature", "forecast"
- Requests with origin/dates asking for destination ideas
- Refinement requests: "make it kid-friendly", "family-friendly", "budget-friendly", "shorter flights"

Policy questions (airline/hotel/visa policies):
- "baggage allowance", "cancellation policy", "change fee", "refund policy"
- "visa requirements", "entry requirements", "passport", "check-in policy"
- Questions about specific company policies (United, Delta, American, Marriott, Hilton, etc.)
- Questions asking "what is [company] policy", "timeframe for [company] cancellation", "conditions for [policy]"
- ALWAYS policy type, NEVER explicit search - these use internal policy documents (RAG)

Explicit search indicators:
- "find", "search", "google", "look up", "search for", "get info", "information about"
- Commands requesting information that requires web search
- NOT basic travel questions like "where should I go", "what should I pack", weather, attractions

Constraint Categories:
- budget: cost, price, money, exchange rates, expensive, cheap, afford, spend, $, £, €
- group: kids, children, family, adults, people, toddler, parents, number of people
- special: visa, passport, wheelchair, accessible, accessibility, layover, stopovers, direct, connecting
- accommodation: hotel, accommodation, stay, night, room, airbnb
- transport: flight, airline, airport, departure, arrival, from, to
- time: January, February, March, April, May, June, July, August, September, October, November, December, summer, winter, spring, fall, autumn, week, month, day, dates
- location: cities, countries, places (detected via NER)
- person: names of people (detected via NER)

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

Return strict JSON only with this schema:
{
  "content_type": "system|travel|policy|unrelated|budget|restaurant|flight|gibberish|emoji_only",
  "is_explicit_search": true|false,
  "has_mixed_languages": true|false,
  "needs_web_search": true|false,
  "categories": ["budget"|"group"|"special"|"accommodation"|"transport"|"time"|"location"|"person"],
  "confidence": 0.00-1.00
}
