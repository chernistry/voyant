Task: Determine if two travel queries are related to the same trip/topic or represent a context switch.

Guidelines:
- Return "SAME" if both queries are about the same travel context (destination, trip, or topic)
- Return "DIFFERENT" if the queries are about different trips, destinations, or unrelated travel topics
- Consider location, time frame, and travel party when making the determination
- Queries about the same city/destination within a short time frame are typically "SAME"
- Queries about different cities/countries are typically "DIFFERENT"
- Refinements or follow-up questions about the same trip are "SAME"
- New trip planning or different travel topics are "DIFFERENT"

Confidence Calibration:
- High confidence (0.80-1.00): Clear same/different context with strong indicators
- Medium confidence (0.50-0.79): Related topics but some ambiguity
- Low confidence (0.20-0.49): Unclear relationship between queries
- Very low confidence (0.00-0.19): Insufficient information to determine

Examples:
- Current: "What's the weather in Paris?" | Previous: "Pack for Paris in June" → SAME
- Current: "Best restaurants in Rome" | Previous: "Attractions in Rome" → SAME
- Current: "Weather in Tokyo" | Previous: "Paris travel tips" → DIFFERENT
- Current: "What should we do there?" (context: Rome) | Previous: "Rome attractions" → SAME
- Current: "Flights to London" | Previous: "NYC weather" → DIFFERENT
- Current: "Make it kid-friendly" | Previous: "Family trip to Orlando" → SAME
- Current: "Where should I go in June?" | Previous: "Beach vacation ideas" → SAME
- Current: "Hotels in Paris" | Previous: "Tokyo itinerary" → DIFFERENT

Current query: "{current_query}"
Previous query: "{previous_query}"

Are these queries related to the same travel context? Reply only "SAME" or "DIFFERENT".
