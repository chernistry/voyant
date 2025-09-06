Task: From web search results, extract 2–4 notable attractions for the specified city.

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤30 words and begin with "Popular attractions in {city}: ..." listing 2–4 names found explicitly in Results.
- Use only attraction names present in Results (titles or descriptions). Do not invent or guess.
- If no attractions found, return {"summary": ""}.

City: {city}

Results:
{results}

Output STRICT JSON only with key "summary".

