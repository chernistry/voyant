Task: Optimize a query for web search engines.

Rules (output is a single line string):
- Return ONLY the optimized query (no extra text, labels, or quotes).
- 8–14 words; lowercase; spaces and hyphens only (no punctuation, no quotes).
- Preserve core intent and ALL constraints (origin, time window, group, budget, accessibility).
- Always keep "from <origin>" if present.
- Include audience/profile and budget when present (e.g., under 2500 usd).
- Avoid logical operators (OR/AND) unless unavoidable.
- Do not invent constraints not present in the input.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear optimization with all relevant keywords and constraints preserved
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
- "Where can I travel from Haifa with 3 kids with $4500 budget in December?" → "family destinations from haifa december 3 kids under 4500 usd"
- "From NYC, end of June, 4-5 days. 2 adults + toddler in stroller. Parents mid-60s; dad dislikes long flights. Budget under $2.5k total. Ideas?" → "family destinations from nyc end june 4-5 days 2 adults toddler seniors short flights under 2500 usd"
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
- Complex family queries: Preserve family composition, ages, special needs, and constraints

User query: {query}
Context: {context}
Intent: {intent}

Output: (one line, optimized query only)
