# Citation Verification

Task: Verify that citations accurately support the provided content and identify any suspicious or fabricated citations.

Objective: Ensure the integrity of cited information by verifying that all citations genuinely support the content and are not fabricated or irrelevant, thereby preventing the spread of misinformation.

## Content to Verify
{content}

## Citations to Check
{citations}

## Verification Instructions
1. Check if each citation's snippet/title actually supports claims in the content
2. Identify citations that seem fabricated or irrelevant
3. Flag citations with suspicious patterns (generic titles, missing details)
4. Verify URLs and sources seem legitimate

## Detailed Evaluation Criteria
- Verified Citations: Directly support claims in the content with specific, relevant information
- Suspicious Citations: Have unclear connections to content or exhibit suspicious patterns
- Fabricated Citations: Appear to be completely made up or have no relation to the content

Suspicious Patterns to Flag:
- Generic titles like "Important Information" or "Read More"
- Missing author, publication date, or source information
- URLs that don't match the claimed source
- Circular citations (citing the same document as both source and citation)
- Vague or non-descriptive snippet text

Confidence Calibration Guidelines:
- 0.80-1.00: Clear determination of citation status with strong evidence
- 0.50-0.79: Moderately confident in the classification
- 0.20-0.49: Uncertain classification requiring conservative judgment
- 0.00-0.19: Indeterminate citation status

## Response Format (Strict JSON Only)
{
  "verified": [0, 1, 3],
  "suspicious": [2],
  "fabricated": [],
  "reasoning": {
    "0": "Citation directly supports main claim",
    "2": "Generic title with no specific details",
    "3": "Relevant and well-sourced"
  }
}

## Key Principles
- Be conservative - only flag citations as suspicious if there are clear red flags
- When in doubt, classify as "suspicious" rather than "fabricated"
- Provide specific reasoning for each classification
- Focus on factual verification rather than subjective judgment
- Do not invent or assume information not present in the citations

## Examples
Content: "The Eiffel Tower was built in 1889."
Citation: "Eiffel Tower Construction Facts - Paris Tourism Board"
Result: {"verified": [0], "suspicious": [], "fabricated": [], "reasoning": {"0": "Citation directly supports the claim about Eiffel Tower construction date"}}

Content: "Vitamin C prevents the common cold."
Citation: "Important Health Information"
Result: {"verified": [], "suspicious": [0], "fabricated": [], "reasoning": {"0": "Generic title with no specific details about Vitamin C or cold prevention"}}
