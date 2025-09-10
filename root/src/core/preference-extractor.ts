import { z } from 'zod';
import { classifyContent, classifyIntent } from './transformers-classifier.js';
import { extractEntities } from './ner.js';
import { getPrompt } from './prompts.js';
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
    
    // Step 4: NLP-based inference with pattern matching
    const preferences: Partial<TravelPreferencesT> = {
      entities: entities.map((e: any) => ({
        text: e.text,
        label: e.entity_group,
        confidence: e.score
      }))
    };

    const lowerText = text.toLowerCase();
    
    // Enhanced family detection (prioritize over other classifications)
    if (lowerText.includes('family') || lowerText.includes('kids') || lowerText.includes('children') || 
        lowerText.includes('toddler') || lowerText.includes('child')) {
      preferences.travelStyle = 'family';
      preferences.groupType = 'family';
    }
    // Romantic detection
    else if (lowerText.includes('romantic') || lowerText.includes('honeymoon') || lowerText.includes('anniversary')) {
      preferences.travelStyle = 'romantic';
      preferences.groupType = 'couple';
    }
    // Adventure detection
    else if (lowerText.includes('adventure') || lowerText.includes('hiking') || lowerText.includes('backpack')) {
      preferences.travelStyle = 'adventure';
    }
    // Cultural detection (fallback)
    else if (lowerText.includes('museum') || lowerText.includes('cultural') || lowerText.includes('heritage')) {
      preferences.travelStyle = 'cultural';
      preferences.activityType = 'museums';
    }
    // Map intent to travel style as fallback
    else if (intentClass.confidence > 0.6) {
      const intentMap: Record<string, string> = {
        'destinations': 'cultural',
        'attractions': 'cultural'
      };
      preferences.travelStyle = intentMap[intentClass.intent] as any;
    }

    // Budget detection
    if (lowerText.includes('budget') || lowerText.includes('cheap') || lowerText.includes('backpack')) {
      preferences.budgetLevel = 'low';
      preferences.travelStyle = 'budget';
    } else if (lowerText.includes('luxury') || lowerText.includes('expensive') || lowerText.includes('5-star')) {
      preferences.budgetLevel = 'high';
      preferences.travelStyle = 'luxury';
    } else {
      preferences.budgetLevel = 'mid';
    }

    // Activity type detection
    if (lowerText.includes('museum') || lowerText.includes('art') || lowerText.includes('gallery')) {
      preferences.activityType = 'museums';
    } else if (lowerText.includes('nature') || lowerText.includes('outdoor') || lowerText.includes('hiking')) {
      preferences.activityType = 'nature';
    } else if (lowerText.includes('nightlife') || lowerText.includes('party') || lowerText.includes('club')) {
      preferences.activityType = 'nightlife';
    }

    // Group type detection from entities
    for (const entity of entities) {
      if (entity.entity_group === 'PER' && entity.score > 0.8) {
        if (!preferences.groupType) {
          if (lowerText.includes('couple')) preferences.groupType = 'couple';
          else if (lowerText.includes('friends')) preferences.groupType = 'friends';
          else if (lowerText.includes('solo')) preferences.groupType = 'solo';
        }
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
    // Use actual LLM for preference extraction
    const { callLLM } = await import('./llm.js');

    const tpl = await getPrompt('preference_extractor');
    const prompt = tpl.replace('{text}', text);

    const response = await callLLM(prompt, { responseFormat: 'json', log });
    const parsed = JSON.parse(response);
    
    if (parsed.confidence > 0.4) {
      return {
        travelStyle: parsed.travelStyle,
        budgetLevel: parsed.budgetLevel || 'mid',
        activityType: parsed.activityType,
        groupType: parsed.groupType,
        confidence: parsed.confidence,
        aiMethod: 'llm'
      };
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
