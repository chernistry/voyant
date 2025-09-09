import { classifyContent } from './transformers-classifier.js';
import type pino from 'pino';

export interface AttractionClassification {
  isKidFriendly: boolean;
  categories: string[];
  confidence: number;
  reasoning?: string;
}

export interface AttractionItem {
  name: string;
  description?: string;
}

/**
 * Classify attractions using NLP instead of hardcoded regex patterns
 */
export async function classifyAttractions(
  attractions: AttractionItem[],
  profile: 'default' | 'kid_friendly' = 'default',
  log?: pino.Logger
): Promise<AttractionItem[]> {
  if (profile === 'default') {
    return attractions; // No filtering needed for default profile
  }

  const classified: AttractionItem[] = [];
  
  for (const attraction of attractions) {
    const classification = await classifyAttraction(attraction, log);
    
    if (profile === 'kid_friendly') {
      if (classification.isKidFriendly) {
        classified.push(attraction);
        if (log?.debug) {
          log.debug({
            name: attraction.name,
            confidence: classification.confidence,
            categories: classification.categories,
            reasoning: classification.reasoning
          }, '👶 NLP: Kid-friendly attraction detected');
        }
      } else {
        if (log?.debug) {
          log.debug({
            name: attraction.name,
            confidence: classification.confidence,
            reasoning: classification.reasoning
          }, '🚫 NLP: Attraction filtered out for kids');
        }
      }
    }
  }
  
  return classified;
}

async function classifyAttraction(
  attraction: AttractionItem,
  log?: pino.Logger
): Promise<AttractionClassification> {
  const text = `${attraction.name} ${attraction.description || ''}`;
  
  try {
    // Step 1: Try NLP classification first
    const contentClass = await classifyContent(text, log);
    
    if (contentClass.confidence > 0.7 && contentClass.content_type === 'travel') {
      // For travel content, assume generally family-friendly unless proven otherwise
      const lowerText = text.toLowerCase();
      const hasNegativeKeywords = /\b(casino|nightclub|bar|cemetery|war|battle)\b/i.test(lowerText);
      
      return {
        isKidFriendly: !hasNegativeKeywords,
        categories: ['nlp_travel'],
        confidence: contentClass.confidence,
        reasoning: `NLP: Travel content, ${hasNegativeKeywords ? 'has negative keywords' : 'no negative indicators'}`
      };
    }
    
    // Step 2: Fallback to LLM if NLP confidence is low
    const { callLLM } = await import('./llm.js');
    
    const prompt = `Is this attraction suitable for families with children? Respond with JSON:
"${text}"

{
  "isKidFriendly": true/false,
  "categories": ["family", "educational", "cultural", "nature", "entertainment"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    
    if (parsed.confidence > 0.5) {
      return {
        isKidFriendly: parsed.isKidFriendly,
        categories: parsed.categories || ['unknown'],
        confidence: parsed.confidence,
        reasoning: `LLM: ${parsed.reasoning}`
      };
    }
    
    // Step 3: Minimal fallback - assume family-friendly unless clearly not
    const lowerText = text.toLowerCase();
    const hasNegativeKeywords = /\b(casino|nightclub|bar|cemetery|war|battle)\b/i.test(lowerText);
    
    return {
      isKidFriendly: !hasNegativeKeywords,
      categories: ['fallback'],
      confidence: 0.3,
      reasoning: 'AI failed - minimal fallback classification'
    };
    
  } catch (error) {
    // Final fallback - assume family-friendly
    return {
      isKidFriendly: true,
      categories: ['error_fallback'],
      confidence: 0.1,
      reasoning: 'Classification error - assumed family-friendly'
    };
  }
}
