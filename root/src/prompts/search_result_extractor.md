Task: Extract relevant information from search results to answer the user's query.

Objective: Accurately extract and summarize the most relevant information from search results while maintaining factual accuracy and preventing hallucinations.

Instructions:
- Extract the most relevant information for a {extractionType} query
- Focus on facts that directly address the user's question: "{query}"
- Prioritize accuracy over completeness
- Do not invent or extrapolate information beyond what is explicitly stated in the search results

Search Results:
{results}

Return JSON with this schema:
{
  "summary": "concise summary of relevant information",
  "confidence": 0.0-1.0,
  "entities": [{"text": "entity", "type": "type", "value": "normalized_value"}],
  "relevanceScore": 0.0-1.0
}

Confidence Calibration Guidelines:
- 0.80-1.00: High confidence - Clear, relevant information directly addresses the query
- 0.50-0.79: Medium confidence - Some relevant information but with gaps or ambiguities
- 0.20-0.49: Low confidence - Limited relevant information or mostly irrelevant results
- 0.00-0.19: Very low confidence - No relevant information found

Extraction Rules:
- Only extract information explicitly stated in the search results
- Do not make inferences or assumptions beyond what is directly stated
- If the search results don't contain relevant information, provide an empty summary
- Focus on factual information rather than opinions or subjective statements
