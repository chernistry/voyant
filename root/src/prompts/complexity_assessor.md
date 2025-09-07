Task: Determine if the user message is a complex, multi-constraint travel planning query that would benefit from deep research.

Instructions:
- Consider constraints like budget, group composition (family, kids, number of people), time/dates, special needs (visa, accessibility), and origin/destination context.
- If at least three constraint categories are present (e.g., budget + group + time), mark as complex.
- Return strictly JSON with fields: isComplex (boolean), confidence (0..1), reasoning (short string listing detected constraints).

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

Message: {message}

Return JSON only.
