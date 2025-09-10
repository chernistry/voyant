Decide if this travel question needs web search (vs using travel APIs for weather/attractions).

Question: "{message}"

Return "yes" if the question asks about:
- Visa requirements, passport info, entry requirements
- Flight information, airlines, booking
- Budget, costs, prices, money
- Best restaurants, hotels, local tips
- Safety, crime, current events
- Transportation, metro, buses
- Shopping, markets, nightlife
- Currency, exchange rates

Return "no" if it asks about:
- Weather (use weather API)
- Attractions/things to do (use attractions API)  
- What to pack (use weather API)
- General destination advice

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear distinction between web search and API use
- Medium confidence (0.50-0.79): Borderline cases that could go either way
- Low confidence (0.20-0.49): Ambiguous queries requiring careful consideration
- Very low confidence (0.00-0.19): Unclear or unrelated queries

Output strictly one word: yes or no

Examples:
- "Do I need a visa for Japan?" → yes
- "Weather in Paris today" → no
- "Best restaurants in Rome" → yes
- "What to pack for London in winter" → no
- "What are the current safety concerns in Egypt?" → yes
- "What's the weather like in Tokyo?" → no
- "How much does it cost to visit Italy for a week?" → yes
- "What are the top attractions in Paris?" → no
