/**
 * Unified NER facade - consolidates transformers-nlp.ts and tools/ner.ts
 * 
 * Strategy selection:
 * - NER_MODE=local: Use @huggingface/transformers pipeline
 * - NER_MODE=remote: Use HF Inference API
 * - NER_MODE=auto (default): Local in test env, remote otherwise
 * 
 * Environment variables:
 * - TRANSFORMERS_NER_MODEL: Model ID (default: Davlan/xlm-roberta-base-ner-hrl)
 * - HF_TOKEN: Optional for remote API
 * - NER_MODE: local|remote|auto
 */
// Configure Transformers.js environment FIRST
import './transformers-env.js';

import 'dotenv/config';
import type pino from 'pino';

export type NerSpan = { entity_group: string; score: number; text: string };

const DEFAULT_MODEL = 'Davlan/xlm-roberta-base-ner-hrl';
const LOCAL_MODEL = 'Xenova/bert-base-multilingual-cased-ner-hrl';
const HF_INFERENCE_URL = 'https://router.huggingface.co/hf-inference/models';
const DEFAULT_TIMEOUT_MS = 2000;
const REMOTE_TIMEOUT_MS = 5000;
const MAX_TEXT_LENGTH = 512;

let nerReady: Promise<((text: string) => Promise<NerSpan[]>)> | null = null;

function getModelName(isLocal: boolean = false, task: 'cities' | 'general' = 'cities'): string {
  // Legacy support
  if (process.env.TRANSFORMERS_NER_MODEL) {
    return process.env.TRANSFORMERS_NER_MODEL;
  }
  
  // Task-specific model selection
  if (isLocal) {
    if (task === 'cities') {
      return process.env.NER_CITIES_MODEL_LOCAL || process.env.NER_GENERAL_MODEL_LOCAL || LOCAL_MODEL;
    } else {
      return process.env.NER_GENERAL_MODEL_LOCAL || LOCAL_MODEL;
    }
  } else {
    if (task === 'cities') {
      return process.env.NER_CITIES_MODEL_REMOTE_API || process.env.NER_GENERAL_MODEL_REMOTE_API || DEFAULT_MODEL;
    } else {
      return process.env.NER_GENERAL_MODEL_REMOTE_API || DEFAULT_MODEL;
    }
  }
}

function shouldUseLocal(): boolean {
  // New global switch
  if (process.env.NLP_USE_LOCAL === 'false') return false;
  if (process.env.NLP_USE_LOCAL === 'true') return true;
  
  // Legacy support
  if (process.env.NER_USE_LOCAL === 'true') return true;
  
  // auto mode: use local in test environment
  return process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
}

async function loadLocalPipeline(log?: pino.Logger): Promise<(text: string) => Promise<NerSpan[]>> {
  try {
    const model = getModelName(true, 'cities'); // Use cities model for better location detection
    const isJest = !!process.env.JEST_WORKER_ID;
    
    if (log?.debug) {
      log.debug({ 
        model, 
        hasToken: !!process.env.HF_TOKEN, 
        isJest,
        jestWorkerId: process.env.JEST_WORKER_ID 
      }, '🤖 NER: Loading local pipeline');
    }
    
    if (isJest) {
      // ✅ Avoid Float32Array realm mismatch inside Jest
      const { nerInChild } = await import('./transformers-classifier.js');
      
      if (log?.debug) {
        log.debug({ model }, '✅ NER: Local pipeline loaded (child process)');
      }
      
      return async (text: string): Promise<NerSpan[]> => {
        try {
          const truncated = text.slice(0, MAX_TEXT_LENGTH);
          const result = await nerInChild(model, truncated);
          return result || [];
        } catch (error) {
          if (log?.debug) {
            log.debug({ error: String(error), text: text.slice(0, 50) }, '❌ NER: Child process failed');
          }
          return [];
        }
      };
    } else {
      // Normal path (CLI / prod)
      const { pipeline } = await import('@huggingface/transformers');
      
      // Suppress console output from transformers.js if LOG_LEVEL is info or higher
      const originalConsole = { ...console };
      const shouldSuppressConsole = ['info', 'warn', 'error'].includes(process.env.LOG_LEVEL || '');
      
      if (shouldSuppressConsole) {
        console.log = () => {};
        console.warn = () => {};
        console.info = () => {};
      }
      
      const ner = await pipeline('token-classification', model as any, {} as any);
      
      // Restore console
      if (shouldSuppressConsole) {
        Object.assign(console, originalConsole);
      }

      if (log?.debug) {
        log.debug({ model }, '✅ NER: Local pipeline loaded');
      }

      return async (text: string) => {
        try {
          const truncated = text.slice(0, MAX_TEXT_LENGTH);
          // @ts-ignore transformers.js aggregation API
          const out = await ner(truncated, { aggregation_strategy: 'simple' });
          const arr: NerSpan[] = Array.isArray(out)
            ? out.map((o: any) => ({
                entity_group: String(o.entity_group || o.entity || '').replace(/^[BI]-/, ''), // Remove B-/I- prefixes
                score: Number(o.score || 0),
                text: String(o.word || o.text || ''),
              }))
            : [];
          return arr;
        } catch (e) {
          if (log?.debug) log.debug({ err: String(e) }, '❌ NER: Local inference failed');
          return [];
        }
      };
    }
  } catch (e) {
    if (log?.debug) {
      log.debug({ 
        error: String(e), 
        model: getModelName(true, 'cities'),
        hasToken: !!process.env.HF_TOKEN 
      }, '❌ NER: Local pipeline loading failed');
    }
    throw e;
  }
}

async function callRemoteAPI(text: string, log?: pino.Logger): Promise<NerSpan[]> {
  const model = getModelName(false, 'cities'); // Use cities model for remote API
  const url = `${HF_INFERENCE_URL}/${model}`;
  
  if (log?.debug) {
    log.debug({ 
      model, 
      hasToken: !!process.env.HF_TOKEN,
      textLength: text.length 
    }, '🌐 NER: Calling remote API');
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (process.env.HF_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: text }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 503) {
        // Model loading, return empty array
        if (log?.debug) {
          log.debug({ status: response.status }, '⏳ NER: Model loading');
        }
        return [];
      }
      throw new Error(`HF API failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
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
      log.debug({ entityCount: entities.length }, '✅ NER: Remote extraction success');
    }
    
    return entities;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      if (log?.debug) {
        log.debug('⏰ NER: Remote request timeout');
      }
    } else {
      if (log?.debug) {
        log.debug({ error: String(error) }, '❌ NER: Remote API failed');
      }
    }
    
    return [];
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return await Promise.race([
    p.finally(() => t && clearTimeout(t)),
    new Promise<T>((_, rej) => {
      t = setTimeout(() => rej(new Error('timeout')), ms);
    }),
  ]);
}

export async function extractEntities(text: string, log?: pino.Logger, opts?: { timeoutMs?: number }): Promise<NerSpan[]> {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const truncated = text.slice(0, MAX_TEXT_LENGTH);
  const timeout = Math.max(200, Math.min(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS, 3000));
  
  if (log?.debug) {
    log.debug({ 
      mode: shouldUseLocal() ? 'local' : 'remote',
      useLocal: shouldUseLocal(),
      model: getModelName(shouldUseLocal(), 'cities'),
      hasToken: !!process.env.HF_TOKEN,
      entityCount: 'pending'
    }, '🔍 NER: Starting extraction');
  }

  try {
    if (shouldUseLocal()) {
      // Use IPC worker in test environment to avoid Jest/ORT typed array issues
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        try {
          const { nerIPC } = await import('./ner-ipc.js');
          const spans = await nerIPC(truncated);
          return Array.isArray(spans) ? spans.map((o: any) => ({
            entity_group: String(o.entity_group || o.entity || ''),
            score: Number(o.score || 0),
            text: String(o.word || o.text || ''),
          })) : [];
        } catch (error) {
          if (log?.debug) {
            log.debug({ error: String(error) }, '❌ NER: IPC worker failed');
          }
          return [];
        }
      }

      // Local pipeline with timeout
      if (!nerReady) nerReady = loadLocalPipeline(log);
      const run = await nerReady;

      // Suppress transformers.js console output if LOG_LEVEL is info or higher
      const shouldSuppressConsole = ['info', 'warn', 'error'].includes(process.env.LOG_LEVEL || '');
      const originalConsole = shouldSuppressConsole ? { ...console } : null;

      if (shouldSuppressConsole) {
        console.log = () => {};
        console.warn = () => {};
        console.info = () => {};
      }

      try {
        const result = await withTimeout(run(truncated), timeout).catch(() => []);
        return result;
      } finally {
        // Restore console
        if (shouldSuppressConsole && originalConsole) {
          Object.assign(console, originalConsole);
        }
      }
    } else {
      // Remote API
      return await callRemoteAPI(truncated, log);
    }
  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ NER: Extraction failed');
    }
    
    // Auto-fallback: if local fails and we're using local mode, try remote
    if (shouldUseLocal() && process.env.NLP_USE_LOCAL !== 'true') {
      if (log?.debug) {
        log.debug('🔄 NER: Auto-fallback to remote');
      }
      return await callRemoteAPI(truncated, log);
    }
    
    return [];
  }
}
