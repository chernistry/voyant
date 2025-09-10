Task: From web search results, extract a concise weather summary for the specified city.

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤25 words, include the city name, and avoid made-up numbers unless present in Results.
- Prefer explicit temperatures (°C/°F) or high/low if present; otherwise provide a short paraphrase grounded in Results.
- If Results lack weather info for the city, return {"summary": ""}.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear weather information with specific data
- Medium confidence (0.50-0.79): General weather information without specific data
- Low confidence (0.20-0.49): Limited or ambiguous weather information
- Very low confidence (0.00-0.19): No relevant weather information

City: {city}

Results:
{results}

Output STRICT JSON only with key "summary".

Examples:
- With temperature data: {"summary": "Current weather in Paris: 22°C with sunny conditions"}
- Without specific data: {"summary": "Weather in Tokyo: Generally mild with occasional rain"}
- No relevant data: {"summary": ""}
- With high/low data: {"summary": "Weather in London: High 18°C, Low 12°C with partly cloudy conditions"}
- With precipitation: {"summary": "Weather in Seattle: Rainy conditions with temperatures around 15°C"}
- With seasonal information: {"summary": "Weather in Sydney: Winter season with mild temperatures"}
- Mixed conditions: {"summary": "Weather in New York: Variable conditions with temperatures between 20-25°C"}
- Forecast information: {"summary": "Weather in Rome: Expected high of 28°C with sunny conditions"}
- With high/low data: {"summary": "Weather in London: High 18°C, Low 12°C with partly cloudy conditions"}
- With precipitation data: {"summary": "Weather in Seattle: Rainy conditions with 15°C temperatures"}
- With seasonal data: {"summary": "Weather in Sydney: Winter conditions, cool with occasional showers"}
- Mixed conditions: {"summary": "Weather in Denver: Variable conditions with highs around 20°C"}
- Extreme weather: {"summary": "Weather in Phoenix: Extremely hot conditions, high temperatures around 40°C"}

