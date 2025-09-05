import type pino from 'pino';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';
import type { Fact } from './receipts.js';

export interface Slots {
  city?: string;
  month?: string;
  dates?: string;
  travelerProfile?: string;
  intent?: string;
  budget?: string;
  climate?: string;
}

export interface CoTAnalysis {
  missingSlots?: string[];
  plan?: Array<{ tool: string; reason: string }>;
  confidence: number;
}

export async function generateAnswerWithCoT(
  ctx: { log: pino.Logger },
  slots: Slots,
  facts: Fact[]
): Promise<string> {
  try {
    const systemMd = await getPrompt('system');
    const cotMd = await getPrompt('cot');
    const blendMd = await getPrompt('blend');

    // Step 1: Analyze using CoT
    const analyzePrompt = `${systemMd}\n\n${cotMd}\n\nAnalyze this request:\nSlots: ${JSON.stringify(slots)}\nFacts: ${JSON.stringify(facts)}`;
    
    const analysisResponse = await callLLM(analyzePrompt, { log: ctx.log });
    
    // Extract missing slots from analysis (simple heuristic)
    const missingSlots: string[] = [];
    if (analysisResponse.includes('missing') && analysisResponse.includes('city')) {
      missingSlots.push('city');
    }
    if (analysisResponse.includes('missing') && (analysisResponse.includes('date') || analysisResponse.includes('month'))) {
      missingSlots.push('dates');
    }

    // If critical slots missing, ask clarifying question
    if (missingSlots.length > 0) {
      return await askOneClarifyingQuestion(slots.intent ?? 'unknown', slots, missingSlots);
    }

    // Step 2: Generate answer using blend prompt
    const answerPrompt = `${systemMd}\n\n${blendMd}\n\nGenerate response for:\nSlots: ${JSON.stringify(slots)}\nFacts: ${JSON.stringify(facts)}`;
    
    const answer = await callLLM(answerPrompt, { log: ctx.log });
    
    return answer.trim();
  } catch (e) {
    ctx.log.error({ error: e }, 'CoT generation failed');
    // Fallback to simple generation
    const blendMd = await getPrompt('blend');
    const systemMd = await getPrompt('system');
    const fallbackPrompt = `${systemMd}\n\n${blendMd}\n\nGenerate response for:\nSlots: ${JSON.stringify(slots)}\nFacts: ${JSON.stringify(facts)}`;
    return await callLLM(fallbackPrompt, { log: ctx.log });
  }
}

async function askOneClarifyingQuestion(
  intent: string,
  slots: Slots,
  missingSlots: string[]
): Promise<string> {
  const missing = missingSlots[0]; // Ask for one thing at a time
  
  if (missing === 'city') {
    return "Which city are you interested in?";
  }
  
  if (missing === 'dates') {
    if (intent === 'weather') {
      return "When are you planning to travel?";
    }
    if (intent === 'packing') {
      return "What time of year will you be traveling?";
    }
    return "When are you planning to visit?";
  }
  
  return "Could you provide more details about your travel plans?";
}
