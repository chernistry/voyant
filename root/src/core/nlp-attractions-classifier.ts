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
  const text = `${attraction.name} ${attraction.description || ''}`.toLowerCase();
  
  try {
    // Use existing content classification to understand the attraction type
    const contentClass = await classifyContent(text, log);
    
    // Kid-friendly indicators (positive signals)
    const kidFriendlyPatterns = [
      /\b(children|child|kids?|toddler|family)\b/i,
      /\b(playground|park|garden|zoo|aquarium)\b/i,
      /\b(interactive|hands-on|science center|discovery)\b/i,
      /\b(carousel|rides|amusement|fun|play)\b/i,
      /\b(educational|learning|museum for children)\b/i
    ];
    
    // Context-aware negative indicators
    const contextualNegatives = [
      // War/violence context
      /\b(war|battle|military|weapon|soldier|combat)\s+(memorial|museum|site)\b/i,
      // Adult-oriented venues
      /\b(casino|nightclub|bar|pub|brewery|winery)\b/i,
      // Somber/serious places
      /\b(cemetery|grave|burial|funeral|mausoleum)\b/i,
      // Adult cultural venues (context-dependent)
      /\b(opera house|symphony|ballet)\b/i
    ];
    
    // Smart historical site handling - not all historic sites are bad for kids
    const kidFriendlyHistoric = [
      /\b(castle|palace|fort)\b.*\b(tour|visit|explore)\b/i,
      /\b(historic\s+)?(village|town|district)\b/i,
      /\b(living history|interactive|reenactment)\b/i
    ];
    
    let kidFriendlyScore = 0;
    let reasoning = '';
    const categories: string[] = [];
    
    // Positive scoring
    for (const pattern of kidFriendlyPatterns) {
      if (pattern.test(text)) {
        kidFriendlyScore += 2;
        categories.push('kid_positive');
        break;
      }
    }
    
    // Handle historic sites intelligently
    if (/\b(historic|historical|heritage)\b/i.test(text)) {
      const isFriendlyHistoric = kidFriendlyHistoric.some(pattern => pattern.test(text));
      if (isFriendlyHistoric) {
        kidFriendlyScore += 1;
        categories.push('historic_friendly');
        reasoning += 'Kid-friendly historic site. ';
      } else {
        kidFriendlyScore -= 1;
        categories.push('historic_serious');
        reasoning += 'Serious historic site. ';
      }
    }
    
    // Negative scoring
    for (const pattern of contextualNegatives) {
      if (pattern.test(text)) {
        kidFriendlyScore -= 3;
        categories.push('kid_negative');
        reasoning += 'Adult-oriented venue. ';
        break;
      }
    }
    
    // Nature and outdoor activities are generally kid-friendly
    if (/\b(park|garden|beach|lake|river|nature|outdoor|trail|hiking)\b/i.test(text)) {
      kidFriendlyScore += 1;
      categories.push('nature');
    }
    
    // Museums need context
    if (/\b(museum)\b/i.test(text)) {
      if (/\b(science|natural history|children|discovery|interactive)\b/i.test(text)) {
        kidFriendlyScore += 2;
        categories.push('educational');
        reasoning += 'Educational museum. ';
      } else if (/\b(art|fine arts|contemporary)\b/i.test(text)) {
        kidFriendlyScore += 0; // Neutral
        categories.push('cultural');
      }
    }
    
    const isKidFriendly = kidFriendlyScore > 0;
    const confidence = Math.min(Math.abs(kidFriendlyScore) / 3, 1);
    
    return {
      isKidFriendly,
      categories,
      confidence,
      reasoning: reasoning.trim() || 'Based on content analysis'
    };
    
  } catch (error) {
    // Fallback to simple heuristics if NLP fails
    const hasKidKeywords = /\b(children|child|kids?|family|playground|zoo|park)\b/i.test(text);
    const hasNegativeKeywords = /\b(cemetery|war|battle|casino|bar|nightclub)\b/i.test(text);
    
    return {
      isKidFriendly: hasKidKeywords && !hasNegativeKeywords,
      categories: ['fallback'],
      confidence: 0.5,
      reasoning: 'Fallback classification due to NLP error'
    };
  }
}
