import 'dotenv/config';
import type pino from 'pino';

export type NerSpan = { entity_group: string; score: number; text: string };

const HF_INFERENCE_URL = 'https://router.huggingface.co/hf-inference/models';
const DEFAULT_MODEL = 'Davlan/xlm-roberta-base-ner-hrl';
const TIMEOUT_MS = 10000;

function getModelName(): string {
  return process.env.TRANSFORMERS_NER_MODEL || DEFAULT_MODEL;
}

async function callHuggingFaceAPI(text: string, log?: pino.Logger): Promise<NerSpan[]> {
  const model = getModelName();
  const url = `${HF_INFERENCE_URL}/${model}`;
  
  if (log?.debug) {
    log.debug({ 
      model, 
      url, 
      hasToken: !!process.env.HF_TOKEN,
      textLength: text.length 
    }, '🌐 NER: Preparing API call');
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (process.env.HF_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    if (log?.debug) {
      log.debug({ model, hasToken: !!process.env.HF_TOKEN }, '🌐 NER: Calling Hugging Face API');
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: text }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (log?.debug) {
      log.debug({ 
        status: response.status, 
        statusText: response.statusText,
        url 
      }, '🌐 NER: API response received');
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      if (log?.debug) {
        log.debug({ 
          status: response.status, 
          statusText: response.statusText,
          errorText,
          url 
        }, '❌ NER: API error details');
      }
      
      if (response.status === 503) {
        // Model is loading, return empty array
        if (log?.debug) {
          log.debug({ status: response.status }, '⏳ NER: Model loading, returning empty results');
        }
        return [];
      }
      throw new Error(`HF API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (log?.debug) {
      log.debug({ 
        resultType: Array.isArray(result) ? 'array' : typeof result,
        resultLength: Array.isArray(result) ? result.length : 'N/A'
      }, '🌐 NER: API result parsed');
    }
    
    if (!Array.isArray(result)) {
      if (log?.debug) {
        log.debug({ result }, '⚠️ NER: Unexpected response format');
      }
      return [];
    }
    
    const entities: NerSpan[] = result.map((item: any) => ({
      entity_group: String(item.entity_group || item.entity || ''),
      score: Number(item.score || 0),
      text: String(item.word || item.text || ''),
    }));
    
    if (log?.debug) {
      log.debug({ entityCount: entities.length, entities }, '✅ NER: Extracted entities');
    }
    
    return entities;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      if (log?.debug) {
        log.debug('⏰ NER: Request timeout');
      }
    } else {
      if (log?.debug) {
        log.debug({ error: String(error), url }, '❌ NER: API call failed');
      }
    }
    
    return [];
  }
}

export async function extractEntities(text: string, log?: pino.Logger): Promise<NerSpan[]> {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Use local transformers in test environment to avoid network calls
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    try {
      const { extractEntities: localExtractEntities } = await import('../core/transformers-nlp.js');
      return await localExtractEntities(text, log);
    } catch (error) {
      if (log?.debug) {
        log.debug({ error: String(error) }, '❌ NER: Local fallback failed');
      }
      return [];
    }
  }
  
  // Truncate text to avoid API limits
  const truncated = text.slice(0, 512);
  
  try {
    return await callHuggingFaceAPI(truncated, log);
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ NER: Cloud extraction failed');
    }
    return [];
  }
}
