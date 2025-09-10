What type of travel query is this?

Message: "{message}"

Types:
- restaurant: asking about restaurants, food, dining, cafes, bars, where to eat
- budget: asking about costs, prices, money, expenses, how much, exchange rates
- flight: asking about airlines, flights, planes, tickets, booking
- none: other types of queries

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear single-category queries
- Medium confidence (0.50-0.79): Queries that could belong to multiple categories
- Low confidence (0.20-0.49): Ambiguous queries
- Very low confidence (0.00-0.19): No clear travel query

Answer with just one word: restaurant, budget, flight, or none

Examples:
- "How much does a trip to Japan cost?" → budget
- "Any good cafes in Prague?" → restaurant
- "Which airlines fly to Bali?" → flight
- "What to see in Lisbon?" → none
- "How much is a meal in Paris?" → budget
- "Looking for a place to eat in Rome" → restaurant
- "When is the next flight to London?" → flight
- "What are the top attractions in Madrid?" → none
