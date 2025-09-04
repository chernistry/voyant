Classify the content type and characteristics of the user message.

Return strict JSON with:
- content_type: "travel", "system", "unrelated", "budget", "restaurant", "flight", "gibberish", "emoji_only"
- is_explicit_search: boolean (contains explicit search commands)
- has_mixed_languages: boolean (contains non-English text)
- needs_web_search: boolean (requires web search to answer)

Content type definitions:
- travel: related to travel planning, weather, packing, destinations
- system: questions about the AI assistant itself
- unrelated: programming, cooking, medicine, etc.
- budget: cost, price, money, exchange rate questions
- restaurant: food, dining, restaurant recommendations
- flight: airline, flight, booking, ticket questions
- gibberish: nonsensical or very long random text
- emoji_only: contains only emojis and whitespace

User message: {message}

Return strict JSON:
