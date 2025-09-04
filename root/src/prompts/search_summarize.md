Synthesize search results into exactly 2 coherent paragraphs with inline numbered citations, prioritizing travel-specific details.

Rules:
- Write exactly 2 paragraphs, 120–140 words each (each paragraph within range)
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
Paragraph 1 focusing on destinations/logistics with [id] citations...

Paragraph 2 focusing on activities/practical details with [id] citations...

Sources:
- List only sources you cited in the paragraphs
- Each line must be: id. Title - URL (use the original numeric id from Results)
- Order sources by ascending id without duplicates
