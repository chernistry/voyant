Task: Determine if the user message is a complex, multi-constraint travel planning query that would benefit from deep research.

Instructions:
- Consider constraints like budget, group composition (family, kids, number of people), time/dates, special needs (visa, accessibility), and origin/destination context.
- If at least three constraint categories are present (e.g., budget + group + time), mark as complex.
- Return strictly JSON with fields: isComplex (boolean), confidence (0..1), reasoning (short string listing detected constraints).

Message: {message}

Return JSON only.
