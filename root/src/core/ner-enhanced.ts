import type pino from 'pino';
import { extractEntities, type NerSpan } from './ner.js';

export interface EnhancedEntity extends NerSpan {
  entity_type: 'LOCATION' | 'DATE' | 'TIME' | 'MONEY' | 'DURATION' | 'PERSON' | 'ORGANIZATION' | 'MISC';
  normalized_text?: string;
  confidence_score: number;
}

export interface EntityExtractionResult {
  entities: EnhancedEntity[];
  locations: EnhancedEntity[];
  dates: EnhancedEntity[];
  money: EnhancedEntity[];
  durations: EnhancedEntity[];
  confidence: number;
}

export interface RetryExtractionResult {
  cities: string[];
  confidence: number;
}

// Enhanced entity type mapping
const ENTITY_TYPE_MAP: Record<string, 'LOCATION' | 'DATE' | 'TIME' | 'MONEY' | 'DURATION' | 'PERSON' | 'ORGANIZATION' | 'MISC'> = {
  'LOC': 'LOCATION',
  'GPE': 'LOCATION', 
  'LOCATION': 'LOCATION',
  'B-LOC': 'LOCATION',
  'I-LOC': 'LOCATION',
  'DATE': 'DATE',
  'TIME': 'TIME',
  'MONEY': 'MONEY',
  'DURATION': 'DURATION',
  'PER': 'PERSON',
  'PERSON': 'PERSON',
  'B-PER': 'PERSON',
  'I-PER': 'PERSON',
  'ORG': 'ORGANIZATION',
  'ORGANIZATION': 'ORGANIZATION',
  'B-ORG': 'ORGANIZATION',
  'I-ORG': 'ORGANIZATION',
  'MISC': 'MISC'
};

// Confidence-aware retry extraction
export async function retryEntityExtractionWithConfidence(
  log: pino.Logger,
  text: string
): Promise<RetryExtractionResult> {
  const { getPrompt } = await import('./prompts.js');
  const { callLLM } = await import('./llm.js');
  const prompt = await getPrompt('entity_extraction_retry');
  const finalPrompt = prompt.replace('{text}', text);

  try {
    const response = await callLLM(finalPrompt, { log });
    const result = JSON.parse(response);
    
    // Validate the response structure using Zod schema
    const { ExtractionResult } = await import('../schemas/extraction.js');
    const validatedResult = ExtractionResult.parse(result);
    
    return {
      cities: validatedResult.cities.map(c => c.name),
      confidence: validatedResult.overallConfidence
    };
  } catch (error) {
    log.debug({ error: String(error) }, '🔍 ENTITY: Retry extraction validation failed');
    return { cities: [], confidence: 0.0 };
  }
}

// Money patterns for enhanced detection
const MONEY_PATTERNS = [
  /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /€\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /£\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|euros?|pounds?|usd|eur|gbp)/gi
];

// Duration patterns
// Common country and city names that might be misclassified as ORG by ONNX model
const KNOWN_LOCATIONS = new Set([
  'canada', 'usa', 'america', 'britain', 'england', 'france', 'germany', 'italy', 'spain', 'japan', 'china', 'india', 'australia',
  'london', 'paris', 'berlin', 'tokyo', 'beijing', 'sydney', 'toronto', 'vancouver', 'montreal', 'new york', 'los angeles',
  'san francisco', 'chicago', 'boston', 'washington', 'miami', 'seattle', 'denver', 'las vegas', 'phoenix', 'atlanta'
]);

// Common English words that should NOT be locations
const COMMON_WORDS = new Set([
  'quick', 'one', 'do', 'us', 'need', 'for', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'from', 'with', 'by',
  'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under'
]);

// Check if an entity is likely a location based on confidence and patterns
function isLikelyLocation(entity: { entity_group: string; text: string; score: number }): boolean {
  const text = entity.text.toLowerCase().trim();
  
  // Exclude common English words (high confidence filter)
  if (COMMON_WORDS.has(text)) {
    return false;
  }
  
  // Must be at least 2 characters and high confidence
  if (text.length < 2 || entity.score < 0.8) {
    return false;
  }
  
  // Check against known locations
  if (KNOWN_LOCATIONS.has(text)) {
    return true;
  }
  
  // For entities already classified as LOC/GPE, trust the model
  if (/LOC|GPE/i.test(entity.entity_group)) {
    return entity.score > 0.7;
  }
  
  // For ORG entities, be more selective
  if (/ORG/i.test(entity.entity_group)) {
    // Check for multi-word locations like "New York"
    const words = text.split(/\s+/);
    if (words.length === 2 && words.every(word => /^[A-Z][a-z]+$/.test(word))) {
      return entity.score > 0.9; // Higher threshold for ORG->LOC conversion
    }
    
    // Check for country-like patterns (capitalized single words)
    if (/^[A-Z][a-z]{3,}$/.test(entity.text) && entity.score > 0.95) {
      return KNOWN_LOCATIONS.has(text); // Only if in known locations
    }
  }
  
  return false;
}

const DURATION_PATTERNS = [
  /\d+\s*(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?)/gi,
  /\d+\s*-\s*\d+\s*(?:hours?|days?|weeks?)/gi
];

export async function extractEntitiesEnhanced(text: string, log?: pino.Logger): Promise<EntityExtractionResult> {
  // Get base entities from transformers NER
  const baseEntities = await extractEntities(text, log);
  
  // Enhance with pattern-based detection for money and duration
  const enhancedEntities: EnhancedEntity[] = [];
  
  // Process base entities
  for (const entity of baseEntities) {
    let entityType = ENTITY_TYPE_MAP[entity.entity_group.toUpperCase()] || 'MISC';
    
    // Special handling for ONNX model: check if ORG entities are actually locations
    if (entityType === 'ORGANIZATION' && isLikelyLocation(entity)) {
      entityType = 'LOCATION';
      if (log?.debug) {
        log.debug({ 
          text: entity.text, 
          originalType: entity.entity_group, 
          reclassified: 'LOCATION' 
        }, '🔄 NER: Reclassified ORG as LOCATION');
      }
    }
    
    enhancedEntities.push({
      ...entity,
      entity_type: entityType,
      normalized_text: normalizeEntityText(entity.text, entityType),
      confidence_score: calculateConfidenceScore(entity, entityType)
    });
  }
  
  // Add pattern-based money detection
  for (const pattern of MONEY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[0] && match.index !== undefined) {
        enhancedEntities.push({
          entity_group: 'MONEY',
          entity_type: 'MONEY',
          score: 0.9,
          text: match[0],
          normalized_text: match[0],
          confidence_score: 0.9
        });
      }
    }
  }
  
  // Add pattern-based duration detection
  for (const pattern of DURATION_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[0] && match.index !== undefined) {
        enhancedEntities.push({
          entity_group: 'DURATION',
          entity_type: 'DURATION',
          score: 0.85,
          text: match[0],
          normalized_text: match[0],
          confidence_score: 0.85
        });
      }
    }
  }
  
  // Remove duplicates and sort by confidence
  const uniqueEntities = deduplicateEntities(enhancedEntities);
  
  // Group by type for easy access
  const locations = uniqueEntities.filter(e => e.entity_type === 'LOCATION');
  const dates = uniqueEntities.filter(e => e.entity_type === 'DATE');
  const money = uniqueEntities.filter(e => e.entity_type === 'MONEY');
  const durations = uniqueEntities.filter(e => e.entity_type === 'DURATION');
  
  // Calculate overall confidence
  const overallConfidence = uniqueEntities.length > 0 
    ? uniqueEntities.reduce((sum, e) => sum + e.confidence_score, 0) / uniqueEntities.length
    : 0.5;
  
  if (log?.debug) {
    log.debug({
      totalEntities: uniqueEntities.length,
      locations: locations.length,
      dates: dates.length,
      money: money.length,
      durations: durations.length,
      overallConfidence
    }, '🔍 NER: Enhanced entity extraction complete');
  }
  
  return {
    entities: uniqueEntities,
    locations,
    dates,
    money,
    durations,
    confidence: overallConfidence
  };
}

function normalizeEntityText(text: string, entityType: string): string {
  const normalized = text.trim();
  
  switch (entityType) {
    case 'LOCATION':
      // Capitalize first letter of each word
      return normalized.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    
    case 'MONEY':
      // Standardize money format
      return normalized.replace(/,/g, '');
    
    default:
      return normalized;
  }
}

function calculateConfidenceScore(entity: NerSpan, entityType: string): number {
  let baseScore = entity.score || 0.5;
  
  // Boost confidence for well-formed entities
  if (entityType === 'LOCATION' && /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*$/.test(entity.text)) {
    baseScore = Math.min(baseScore + 0.1, 1.0);
  }
  
  if (entityType === 'DATE' && /\d{4}|\d{1,2}\/\d{1,2}/.test(entity.text)) {
    baseScore = Math.min(baseScore + 0.15, 1.0);
  }
  
  return baseScore;
}

function deduplicateEntities(entities: EnhancedEntity[]): EnhancedEntity[] {
  const seen = new Set<string>();
  const unique: EnhancedEntity[] = [];
  
  // Sort by confidence score descending
  const sorted = entities.sort((a, b) => b.confidence_score - a.confidence_score);
  
  for (const entity of sorted) {
    const key = `${entity.entity_type}:${entity.text.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entity);
    }
  }
  
  return unique;
}
