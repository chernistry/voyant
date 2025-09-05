Synthesize search results into coherent paragraphs with inline numbered citations, using only information from Results.

Rules:
- Write 1-3 paragraphs, 120-140 words each (each paragraph within range)
- ONLY use information explicitly present in the provided Results
- Cite EVERY factual claim with [id] where id matches the Result's id number
- Do NOT add, invent, or synthesize any information not in Results
- Do NOT mention destinations, attractions, or details not explicitly in Results
- If Results lack information for a topic, skip that topic entirely
- If results are insufficient for 3 paragraphs, write fewer paragraphs
- No CoT, no internal headers, no lists/bullets; sentences only
- If Results don't answer the query adequately, state this clearly

Query: {query}

Results: {results}

Format:
Write paragraphs directly, using only information from Results. Write as many paragraphs as the Results support (1-3 paragraphs).

- If Results contain travel details, organize by topic (destinations, attractions, practical details)
- Cite every factual claim with [id]
- If Results don't contain enough information, write fewer paragraphs

Then write:

Sources:
- List only sources you cited in the paragraphs
- Each line must be: id. Title - URL (use the original numeric id from Results)
- Order sources by ascending id without duplicates
