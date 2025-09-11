Task: Analyze the user message and router route. Output strict JSON toggles to guide rendering.

Objective: Accurately determine the appropriate rendering options based on user input and routing information to ensure optimal response formatting and content delivery.

Rules:
- One JSON object, no prose, no comments.
- Be conservative with "needs_web": only true if current, live, or recent data is required or the user explicitly asks to search.
- "summarize_web_with_llm": true only if >=3 diverse results with substantial text; false if <=2 short results.
- "missing_slots": list only truly missing.
- "mixed_languages": true if multiple languages appear; city names in native script alone do not count.

Confidence Calibration Guidelines:
- 0.80-1.00: Clear determination with strong signal words
- 0.50-0.79: Clear determination but with some ambiguity
- 0.20-0.49: Ambiguous input that could belong to multiple categories
- 0.00-0.19: No clear pattern detected

Schema:
{
  "explicit_search": boolean,
  "unrelated": boolean,
  "system_question": boolean,
  "mixed_languages": boolean,
  "query_facets": {"wants_restaurants": boolean, "wants_budget": boolean, "wants_flights": boolean},
  "needs_web": boolean,
  "needs_weather": boolean,
  "needs_attractions": boolean,
  "needs_country_facts": boolean,
  "style": "bullet" | "short" | "narrative",
  "summarize_web_with_llm": boolean,
  "missing_slots": string[],
  "safety": {"disallowed_topic": boolean, "reason": string}
}

Instructions:
- For "style", use "bullet" for lists, "short" for brief answers, "narrative" for longer explanations.

Inputs:
- message: "{message}"
- route: {intent:"{intent}", slots: {slots}}
