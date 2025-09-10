Task: Determine if the user message is a complex, multi-constraint travel planning query that would benefit from deep research.

Instructions:
- Consider constraints like budget, group composition (family, kids, number of people), time/dates, special needs (visa, accessibility), and origin/destination context.
- If at least three constraint categories are present (e.g., budget + group + time), mark as complex.
- Return strictly JSON with fields: isComplex (boolean), confidence (0..1), reasoning (short string listing detected constraints).

Confidence Calibration Guidelines:
- 0.80-1.00: Clear complex query with multiple well-defined constraints
- 0.50-0.79: Query with some constraints but missing details
- 0.20-0.49: Simple query with few or vague constraints
- 0.00-0.19: Very simple or unrelated query

Constraint Categories:
- Budget: cost, price, money, exchange rates, expensive, cheap, afford, spend, $, £, €
- Group: kids, children, family, adults, people, toddler, parents, number of people
- Special: visa, passport, wheelchair, accessible, accessibility, layover, stopovers, direct, connecting
- Accommodation: hotel, accommodation, stay, night, room, airbnb
- Transport: flight, airline, airport, departure, arrival, from, to
- Time: January, February, March, April, May, June, July, August, September, October, November, December, summer, winter, spring, fall, autumn, week, month, day, dates
- Location: cities, countries, places (detected via NER)
- Duration: week, weeks, days, day, 2-week, 10-day, etc.

Few-shot examples:

Input: "Where to go in June from NYC?"
Output: {"isComplex": false, "confidence": 0.8, "reasoning": "simple destination query: time + location"}

Input: "What's the weather in Paris?"
Output: {"isComplex": false, "confidence": 0.9, "reasoning": "simple weather query: location only"}

Input: "Where should I go in June from NYC with 3 kids on a $2000 budget?"
Output: {"isComplex": true, "confidence": 0.9, "reasoning": "multiple constraints: time + location + group + budget"}

Input: "Plan a 2-week family trip to Europe with wheelchair accessibility under $5000"
Output: {"isComplex": true, "confidence": 0.95, "reasoning": "multiple constraints: duration + group + location + accessibility + budget"}

Input: "Make it kid-friendly"
Output: {"isComplex": false, "confidence": 0.7, "reasoning": "simple refinement: group preference only"}

Input: "I need a weekend getaway from London" (simple)
Output: {"isComplex": false, "confidence": 0.6, "reasoning": "simple destination query: location + time"}

Input: "Family of four looking for a beach vacation in July with a $3000 budget" (complex)
Output: {"isComplex": true, "confidence": 0.85, "reasoning": "multiple constraints: group + location + time + budget"}

Message: {message}

Return JSON only.
