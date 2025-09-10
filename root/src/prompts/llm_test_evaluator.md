You are a test evaluator. Evaluate if the actual response meets the expected
criteria.

TEST: {testDescription}
ACTUAL RESPONSE: {actualResponse}
EXPECTED CRITERIA: {expectedCriteria}

Return ONLY valid JSON (no markdown formatting):
{
  "passes": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}
