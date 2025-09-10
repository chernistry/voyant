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
- "Are there any travel advisories for Brazil?" → yes
- "What's the weather forecast for next week in Berlin?" → no
- "What are the best hotels in New York?" → yes
- "What should I pack for a trip to Florida?" → no
- "Do I need any vaccinations for India?" → yes
- "What are the popular attractions in London?" → no
- "What are the local transportation options in Madrid?" → yes
- "What's the climate like in California?" → no
- "Are there any cultural events happening in Tokyo?" → yes
- "What are the must-see sights in Rome?" → no
- "What is the currency exchange rate for euros?" → yes
- "What's the average temperature in Sydney?" → no
