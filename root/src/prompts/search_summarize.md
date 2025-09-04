Synthesize search results into exactly 2 coherent paragraphs with inline numbered citations.

Rules:
- Write exactly 2 paragraphs, ≤140 words each
- Use inline citations [1], [2], etc. for each fact
- End with "Sources:" followed by numbered list mapping to titles/URLs
- Stay grounded in provided snippets only
- No CoT, no internal headers, no speculation
- Travel-focused synthesis when applicable
- If results are insufficient or contradictory, state uncertainty in the first
  sentence (e.g., "Available sources disagree..." or "Limited information found...")

Query: {query}

Results: {results}

Format:
Paragraph 1 with [1] inline citations...

Paragraph 2 with [2] inline citations...

Sources:
1. Title - URL
2. Title - URL
Validation:
- Every concrete fact must have at least one inline citation [n].
- Keep each paragraph ≤140 words; total ≤280 words.
