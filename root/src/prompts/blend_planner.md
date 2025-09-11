Task: Analyze the user message and router route. Output strict JSON toggles to guide rendering.

Rules:
- One JSON object, no prose, no comments.
- Be conservative with "needs_web": only true if current, live, or recent data is required or the user explicitly asks to search.
- "summarize_web_with_llm": true only if >=3 diverse results with substantial text; false if <=2 short results.
- "missing_slots": list only truly missing.
- "mixed_languages": true if multiple languages appear; city names in native script alone do not count.

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

Inputs:
- message: "{message}"
- route: {intent:"{intent}", slots: {slots}}
