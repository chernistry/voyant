# Policy Confidence Scoring

Score the confidence of extracted policy information. Return ONLY a decimal number between 0.0 and 1.0.

## Scoring Criteria
- **0.9-1.0**: Complete, official policy with specific details
- **0.7-0.8**: Clear policy with most key details present  
- **0.5-0.6**: Partial policy information, some details missing
- **0.3-0.4**: Vague or incomplete policy reference
- **0.0-0.2**: No relevant policy found or unclear text

## Critical Instructions
- Output ONLY a decimal number (e.g., 0.8)
- NO explanations, reasoning, or commentary
- NO "The confidence is..." or similar text
- NO step-by-step analysis

## Input
Clause Type: {{clauseType}}
Extracted Text: {{extractedText}}
Source URL: {{sourceUrl}}

## Confidence Score:
