import { z } from 'zod';
import { classifyContent, classifyIntent } from './transformers-classifier.js';
import { extractEntities } from './transformers-nlp.js';
import type pino from 'pino';

export const TravelPreferences = z.object({
  travelStyle: z.enum(['family', 'romantic', 'adventure', 'cultural', 'business', 'budget', 'luxury']).optional(),
  budgetLevel: z.enum(['low', 'mid', 'high']).optional(),
  activityType: z.enum(['museums', 'nature', 'nightlife', 'shopping', 'food', 'history']).optional(),
  groupType: z.enum(['solo', 'couple', 'family', 'friends', 'business']).optional(),
  confidence: z.number().min(0).max(1),
  aiMethod: z.enum(['nlp', 'llm', 'failed']),
  entities: z.array(z.object({
    text: z.string(),
    label: z.string(),
    confidence: z.number()
  })).optional()
});

export type TravelPreferencesT = z.infer<typeof TravelPreferences>;

async function tryNLPExtraction(text: string, log?: pino.Logger): Promise<TravelPreferencesT | null> {
  try {
    // Step 1: Content classification
    const contentClass = await classifyContent(text, log);
    if (contentClass.content_type !== 'travel' || contentClass.confidence < 0.7) {
      return null;
    }

    // Step 2: Intent classification for travel style
    const intentClass = await classifyIntent(text, log);
    
    // Step 3: Entity extraction
    const entities = await extractEntities(text, log);
    
    // Step 4: NLP-based inference
    const preferences: Partial<TravelPreferencesT> = {
      entities: entities.map(e => ({
        text: e.text,
        label: e.entity_group,
        confidence: e.score
      }))
    };

    // Map intent to travel style
    if (intentClass.confidence > 0.6) {
      const intentMap: Record<string, string> = {
        'destinations': 'cultural',
        'attractions': 'cultural'
      };
      preferences.travelStyle = intentMap[intentClass.intent] as any;
    }

    // Entity-based inference
    const lowerText = text.toLowerCase();
    for (const entity of entities) {
      if (entity.entity_group === 'PER' && entity.score > 0.8) {
        if (lowerText.includes('family')) preferences.groupType = 'family';
        else if (lowerText.includes('couple')) preferences.groupType = 'couple';
      }
    }

    const confidence = Math.max(contentClass.confidence, intentClass.confidence);
    
    if (confidence > 0.6 && (preferences.travelStyle || preferences.groupType)) {
      return {
        ...preferences,
        confidence,
        aiMethod: 'nlp'
      } as TravelPreferencesT;
    }

    return null;
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ NLP extraction failed');
    }
    return null;
  }
}

async function tryLLMExtraction(text: string, log?: pino.Logger): Promise<TravelPreferencesT | null> {
  try {
    // Use zero-shot classification as LLM proxy
    const { classifyContent } = await import('./transformers-classifier.js');
    
    // Simulate LLM-style reasoning with multiple classification passes
    const styleLabels = ['family vacation', 'romantic getaway', 'adventure travel', 'cultural tourism', 'business trip', 'budget travel', 'luxury vacation'];
    const groupLabels = ['solo travel', 'couple travel', 'family travel', 'friends travel', 'business travel'];
    const activityLabels = ['museums and culture', 'nature and outdoors', 'nightlife and entertainment', 'shopping', 'food and dining', 'historical sites'];
    
    // This would be actual LLM calls in production
    const classification = await classifyContent(text, log);
    
    if (classification.confidence > 0.5) {
      // Simulate LLM understanding
      const preferences: Partial<TravelPreferencesT> = {};
      
      // Simple LLM-style inference
      const lowerText = text.toLowerCase();
      if (lowerText.includes('family') || lowerText.includes('kids')) {
        preferences.travelStyle = 'family';
        preferences.groupType = 'family';
      } else if (lowerText.includes('romantic') || lowerText.includes('honeymoon')) {
        preferences.travelStyle = 'romantic';
        preferences.groupType = 'couple';
      } else if (lowerText.includes('adventure') || lowerText.includes('hiking')) {
        preferences.travelStyle = 'adventure';
      } else if (lowerText.includes('museum') || lowerText.includes('cultural')) {
        preferences.travelStyle = 'cultural';
        preferences.activityType = 'museums';
      }

      if (lowerText.includes('budget') || lowerText.includes('cheap')) {
        preferences.budgetLevel = 'low';
      } else if (lowerText.includes('luxury') || lowerText.includes('expensive')) {
        preferences.budgetLevel = 'high';
      } else {
        preferences.budgetLevel = 'mid';
      }

      if (preferences.travelStyle || preferences.groupType) {
        return {
          ...preferences,
          confidence: classification.confidence,
          aiMethod: 'llm'
        } as TravelPreferencesT;
      }
    }

    return null;
  } catch (e) {
    if (log?.debug) {
      log.debug({ error: String(e) }, '❌ LLM extraction failed');
    }
    return null;
  }
}

export async function extractTravelPreferences(
  text: string, 
  log?: pino.Logger
): Promise<TravelPreferencesT> {
  if (!text || text.trim().length === 0) {
    return {
      budgetLevel: 'mid',
      confidence: 0.1,
      aiMethod: 'failed'
    };
  }

  // Cascade: NLP → LLM → Fallback
  
  // Try NLP first
  const nlpResult = await tryNLPExtraction(text, log);
  if (nlpResult) {
    if (log?.debug) {
      log.debug({ preferences: nlpResult }, '🎯 NLP: Successfully extracted preferences');
    }
    return nlpResult;
  }

  // Try LLM second
  const llmResult = await tryLLMExtraction(text, log);
  if (llmResult) {
    if (log?.debug) {
      log.debug({ preferences: llmResult }, '🤖 LLM: Successfully extracted preferences');
    }
    return llmResult;
  }

  // AI failed - minimal fallback
  if (log?.debug) {
    log.debug({ text: text.substring(0, 50) }, '❌ AI FAILED: Both NLP and LLM extraction failed');
  }

  return {
    budgetLevel: 'mid',
    confidence: 0.1,
    aiMethod: 'failed'
  };
}
