Analyze this flight-related query and determine if it's a DIRECT flight search or
COMPLEX travel planning.

DIRECT flight search characteristics:
- Specific origin and destination mentioned
- Clear travel dates or timeframe
- Focused on finding/booking flights
- Examples: "flights from NYC to London in March", "book flight Moscow to Tel Aviv October",
  "find flights Paris to Tokyo next week"

COMPLEX travel planning characteristics:
- Multiple constraints (budget, family needs, preferences)
- Seeking recommendations or ideas
- Multiple travel components (hotels, activities, etc.)
- Examples: "From NYC, end of June, 4-5 days, 2 adults + toddler, budget $2.5k, ideas?",
  "family trip to Europe with elderly parents, need short flights"

Query: "{message}"

Return JSON with:
- isDirect: true/false
- confidence: 0.0-1.0 (how certain you are)
- reasoning: brief explanation

Examples:
"flights from moscow to tel aviv in october" -> {"isDirect": true, "confidence": 0.95,
"reasoning": "Clear origin, destination, and timeframe specified"}
"From NYC, end of June, 4-5 days, 2 adults + toddler, budget $2.5k, ideas?" ->
{"isDirect": false, "confidence": 0.9,
"reasoning": "Complex planning with multiple constraints and seeking ideas"}
