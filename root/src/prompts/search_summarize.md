Synthesize the Results into a concise, helpful answer with inline numbered citations.

Rules:
- Output ≤ 180 words total.
- Start with a 1–2 sentence direct answer to the Query.
- Then 3–5 bullets with the most relevant facts; end each bullet with [id].
- ONLY use information explicitly present in Results. No inventions.
- If Results don't answer the Query, say so and ask one clarifying question.
- Keep wording concrete; avoid generic advice.
- Include a Sources section with the cited ids and direct URLs.

Confidence Calibration Guidelines:
- High confidence (0.80-1.00): Clear synthesis with multiple relevant facts
- Medium confidence (0.50-0.79): Good synthesis but with some gaps
- Low confidence (0.20-0.49): Limited synthesis with few relevant facts
- Very low confidence (0.00-0.19): Poor synthesis or mostly irrelevant results

Query: {query}

Results: {results}

Format:
<short answer (1–2 sentences)>

- <bullet with key fact> [id]
- <bullet with key fact> [id]
- <bullet with key fact> [id]
(3–5 bullets)

Sources:
id. Title - URL
(list only cited ids; ascending order)

Edge Cases:
- Incomplete results: Acknowledge limitations and ask for clarification
- Contradictory information: Note discrepancies and cite sources
- Sparse information: Focus on the most reliable facts only
