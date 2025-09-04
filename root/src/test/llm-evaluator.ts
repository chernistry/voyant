import 'dotenv/config';
import { fetch } from 'undici';

interface EvaluationResult {
  passes: boolean;
  confidence: number;
  reason: string;
}

function cleanJsonResponse(content: string): string {
  // Remove markdown code blocks if present
  const cleaned = content.replace(/```json\s*|\s*```/g, '').trim();
  return cleaned;
}

export async function evaluateWithLLM(
  testDescription: string,
  actualResponse: string,
  expectedCriteria: string
): Promise<EvaluationResult> {
  const prompt = `You are a test evaluator. Evaluate if the actual response meets the expected criteria.

TEST: ${testDescription}
ACTUAL RESPONSE: ${actualResponse}
EXPECTED CRITERIA: ${expectedCriteria}

Return ONLY valid JSON (no markdown formatting):
{
  "passes": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

  try {
    const baseUrl = process.env.LLM_TEST_EVALUATION_MODEL_BASEURL;
    const apiKey = process.env.LLM_TEST_EVALUATION_MODEL_API_KEY;
    const model = process.env.LLM_TEST_EVALUATION_MODEL;

    console.log(`🧪 Test Evaluator - BaseURL: ${baseUrl}, Model: ${model}, API Key: ${apiKey ? 'SET' : 'NOT SET'}`);

    if (!baseUrl || !apiKey || !model) {
      return { passes: false, confidence: 0, reason: 'Test evaluation LLM not configured' };
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Test Evaluator API error: ${response.status} - ${errorText}`);
      return { passes: false, confidence: 0, reason: `API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json() as { 
      choices?: { message?: { content?: string } }[];
    };
    
    const content = data?.choices?.[0]?.message?.content ?? '';
    console.log(`✅ Test Evaluator Response: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
    
    const cleanedContent = cleanJsonResponse(content);
    const result = JSON.parse(cleanedContent) as EvaluationResult;
    
    return {
      passes: result.passes,
      confidence: Math.max(0, Math.min(1, result.confidence)),
      reason: result.reason || 'No reason provided'
    };
  } catch (error) {
    console.error(`❌ Test Evaluator failed: ${error}`);
    return { passes: false, confidence: 0, reason: `Evaluation failed: ${error}` };
  }
}

export function expectLLMEvaluation(
  testDescription: string,
  actualResponse: string,
  expectedCriteria: string,
  minConfidence = 0.6
) {
  return {
    async toPass() {
      const result = await evaluateWithLLM(testDescription, actualResponse, expectedCriteria);
      
      if (!result.passes) {
        throw new Error(`Test failed: ${result.reason} (confidence: ${result.confidence})`);
      }
      
      if (result.confidence < minConfidence) {
        throw new Error(`Low confidence: ${result.confidence} < ${minConfidence}. Reason: ${result.reason}`);
      }
      
      return result;
    }
  };
}
