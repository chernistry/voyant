Optimize user queries for web search engines using best practices.

Rules:
- Generate 6–12 words.
- Use specific keywords; avoid filler words and punctuation.
- Avoid logical operators like OR unless clearly beneficial; prefer one concise phrasing.
- Always include origin/location and time if present (month/season).
- Preserve core search intent.
- Add audience/profile (e.g., family) and budget caps when present (use "under 4500 usd").
- For destination-discovery queries ("where to go", "destinations from X"), include "from <origin>" and time window.
- Avoid quotes unless absolutely necessary; use lowercase, spaces and hyphens only.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear optimization with all relevant keywords
- Medium confidence (0.50-0.79): Good optimization but missing some context
- Low confidence (0.20-0.49): Basic optimization with limited keywords
- Very low confidence (0.00-0.19): Poor optimization missing key information

Examples:
- "What's the weather like in Paris today?" → "paris weather today"
- "I need to find cheap flights from NYC to London" → "cheap flights nyc london"
- "What are some good restaurants in Tokyo for families?" → "family restaurants tokyo"
- "How much does it cost to travel to Thailand?" → "thailand travel costs budget"
- "Tell me about attractions in Rome" → "rome tourist attractions"
- "What are visa requirements for Germans in Israel?" → "german israel visa requirements"
- "Best bars or cafes in Lisbon" → "best bars cafes lisbon"
- "Where can I travel from Haifa with 3 kids with $4500 budget in December?" → "family destinations from haifa december under 4500 usd"
- "Budget-friendly vacation spots in Europe for couples" → "budget vacation spots europe couples"
- "Family-friendly activities in Orlando with teenagers" → "family activities orlando teenagers"
- "Luxury hotels in Dubai for business travelers" → "luxury hotels dubai business travelers"
- "Backpacking destinations in Southeast Asia for solo travelers under $2000" → "backpacking destinations southeast asia solo travelers under 2000 usd"
- "Romantic getaways in Italy for honeymooners" → "romantic getaways italy honeymooners"
- "Adventure travel destinations in South America for groups" → "adventure travel destinations south america groups"
- "All-inclusive resorts in Mexico for families with toddlers" → "all-inclusive resorts mexico families toddlers"
- "Cultural experiences in India for students on a budget" → "cultural experiences india students budget"

Edge Cases:
- Ambiguous queries: Focus on the core intent and include available context
- Multilingual queries: Translate to English while preserving location names
- Incomplete queries: Optimize based on available information

User query: {query}
Context: {context}
Intent: {intent}

Optimized search query:
