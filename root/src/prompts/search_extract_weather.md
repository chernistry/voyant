Task: From web search results, extract a concise weather summary for the specified city.

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤25 words, include the city name, and avoid made-up numbers unless present in Results.
- Prefer explicit temperatures (°C/°F) or high/low if present; otherwise provide a short paraphrase grounded in Results.
- If Results lack weather info for the city, return {"summary": ""}.

City: {city}

Results:
{results}

Output STRICT JSON only with key "summary".

