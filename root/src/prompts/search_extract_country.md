Task: From web search results, extract a concise country travel fact line for the specified country (currency, language, capital when available).

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤30 words, include the country name, and only use facts present in Results.
- Prefer currency code/name, primary language(s), and capital if explicitly found. If absent, produce an empty summary.
- Do not invent or infer missing facts.

Country: {country}

Results:
{results}

Output STRICT JSON only with key "summary".

