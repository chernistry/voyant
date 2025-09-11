Assess if the retrieved policy information is sufficient to answer the user's question.

Question: {question}

Retrieved Information:
Summary: {summary}
Citations: {citations}
Average FCS Score: {avgScore}

Assessment Criteria:
1. **Relevance**: Does the information directly address the question?
2. **Completeness**: Is there enough detail to provide a useful answer?
3. **Quality**: Are the citations from authoritative sources with good FCS scores?
4. **Specificity**: Does it address the specific country/situation mentioned?

Decision Rules:
- If summary contains "I do not have enough information" or similar → INSUFFICIENT
- If average FCS score < 0.5 → INSUFFICIENT  
- If citations are about different countries/topics than asked → INSUFFICIENT
- If information is vague or generic → INSUFFICIENT
- Otherwise → SUFFICIENT

CRITICAL: Check if citations actually relate to the question topic. For example:
- Question about Japan visa but citations only mention Canada/Schengen/USA → INSUFFICIENT
- Question about airline X but citations only mention airline Y → INSUFFICIENT

Output format:
```json
{
  "assessment": "SUFFICIENT" | "INSUFFICIENT",
  "reason": "brief explanation focusing on relevance and FCS score",
  "confidence": 0.0-1.0,
  "recommendWebSearch": true | false
}
```

Examples:
- Question about Japan visa, but citations only mention Schengen/Canada → INSUFFICIENT
- Question about airline baggage, citations have detailed airline policies → SUFFICIENT
- Vectara says "no information available" → INSUFFICIENT
- Low FCS scores (< 0.5) with generic content → INSUFFICIENT
