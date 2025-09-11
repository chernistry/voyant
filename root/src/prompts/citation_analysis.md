# Citation Analysis

Analyze the provided citations for relevance, quality, and potential issues.

## Query
{query}

## Content
{content}

## Citations to Analyze
{citations}

## Instructions
1. Score each citation's relevance to the query (0.0-1.0)
2. Score each citation's quality based on title, snippet, and source (0.0-1.0)
3. Identify potential duplicates
4. Suggest optimal formatting
5. Verify citations don't contradict the content
6. Recommend how many citations to display (1-5)

## Response Format (JSON)
```json
{
  "citations": [
    {
      "id": 0,
      "relevanceScore": 0.9,
      "qualityScore": 0.8,
      "isDuplicate": false,
      "verificationStatus": "verified",
      "suggestedFormat": "Policy Document Title — source.com"
    }
  ],
  "recommendedCount": 3,
  "overallQuality": 0.85,
  "hasFabricated": false,
  "reasoning": "Brief explanation of analysis"
}
```

Focus on accuracy and relevance. Flag any citations that seem fabricated or irrelevant.
