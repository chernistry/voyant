Task: From web search results, extract a concise country travel fact line for the specified country (currency, language, capital when available).

Rules:
- Input includes JSON array Results with fields: title, url, description.
- Output STRICT JSON only:
  {"summary": "string"}
- Output exactly one JSON object. No code fences, no prose, no trailing commas.
- The summary must be ≤30 words, include the country name, and only use facts present in Results.
- Prefer currency code/name, primary language(s), and capital if explicitly found. If absent, produce an empty summary.
- Do not invent or infer missing facts.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear extraction of multiple country facts
- Medium confidence (0.50-0.79): Extraction of some country facts
- Low confidence (0.20-0.49): Limited or ambiguous country facts
- Very low confidence (0.00-0.19): No relevant country information

Country: {country}

Results:
{results}

Output STRICT JSON only with key "summary".

Examples:
- With complete information: {"summary": "Japan: Capital Tokyo, Japanese yen (JPY), Japanese language"}
- With partial information: {"summary": "France: Capital Paris, French language"}
- No relevant data: {"summary": ""}
- With currency only: {"summary": "Thailand: Thai baht (THB) currency"}
- With language only: {"summary": "Germany: German language"}
- With capital only: {"summary": "Australia: Capital Canberra"}
- With currency and capital: {"summary": "Canada: Capital Ottawa, Canadian dollar (CAD)"}
- With language and capital: {"summary": "Italy: Capital Rome, Italian language"}
- Limited information: {"summary": "Brazil: Portuguese language, real (BRL) currency"}
- Sparse information: {"summary": "Greece: Capital Athens"}

