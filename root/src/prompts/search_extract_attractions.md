Task: From web search results, extract 2–4 notable attractions for the specified city.

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤30 words and begin with "Popular attractions in {city}: ..." listing 2–4 names found explicitly in Results.
- Use only attraction names present in Results (titles or descriptions). Do not invent or guess.
- If no attractions found, return {"summary": ""}.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear extraction of multiple attractions
- Medium confidence (0.50-0.79): Extraction of some attractions
- Low confidence (0.20-0.49): Limited or ambiguous attraction information
- Very low confidence (0.00-0.19): No relevant attraction information

City: {city}

Results:
{results}

Output STRICT JSON only with key "summary".

Examples:
- With attractions: {"summary": "Popular attractions in Paris: Eiffel Tower, Louvre Museum, Notre-Dame Cathedral"}
- With fewer attractions: {"summary": "Popular attractions in London: Tower of London, Buckingham Palace"}
- No relevant data: {"summary": ""}
- With sparse results: {"summary": "Popular attractions in Rome: Colosseum, Vatican City"}
- With limited information: {"summary": "Popular attractions in Barcelona: Sagrada Família, Park Güell"}
- With single attraction: {"summary": "Popular attractions in Amsterdam: Rijksmuseum"}
- With descriptive names: {"summary": "Popular attractions in New York: Statue of Liberty, Central Park"}
- With mixed quality results: {"summary": "Popular attractions in Tokyo: Tokyo Tower, Senso-ji Temple"}
- With regional attractions: {"summary": "Popular attractions in Sydney: Sydney Opera House, Bondi Beach"}

