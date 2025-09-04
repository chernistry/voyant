Synthesize search results into exactly 3 coherent paragraphs with inline numbered citations, prioritizing travel-specific details.

Rules:
- Write exactly 3 paragraphs, 120–140 words each (each paragraph within range)
- Cite every factual claim with [id], where id is the numeric id of a Result
- Use only information from Results; do not invent numbers, dates, or names
- If results are insufficient or contradictory, begin paragraph 1 with "Uncertain:" and briefly state why
- No CoT, no internal headers, no lists/bullets; sentences only
- ALWAYS preserve specific travel details: destinations, prices, dates, attractions, transportation, accommodations, family-friendly features
- Prefer concrete numbers from Results; if absent, describe without fabricating ranges

Query: {query}

Results: {results}

Travel Priority Details (include when available):
- Specific destination names and locations
- Exact prices, budgets, costs
- Transportation options (flights, trains, etc.)
- Accommodation suggestions
- Family/kid-friendly attractions and activities
- Weather information and seasonal considerations
- Accessibility and walking requirements
- Time durations and itineraries

Format:
Write three paragraphs directly, without any prefixes or headers (no "Paragraph 1:", "Paragraph 2:", etc.).

First paragraph: focus on destinations and logistics (transportation, prices, accommodations) with [id] citations.

Second paragraph: focus on attractions and activities (family-friendly features, accessibility) with [id] citations.

Third paragraph: focus on practical details (weather, seasonal considerations, itineraries) with [id] citations.

Then write:

Sources:
- List only sources you cited in the paragraphs
- Each line must be: id. Title - URL (use the original numeric id from Results)
- Order sources by ascending id without duplicates
