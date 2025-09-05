import 'dotenv/config';
import type pino from 'pino';

export type NerSpan = { entity_group: string; score: number; text: string };

let nerReady: Promise<((text: string) => Promise<NerSpan[]>)> | null = null;

function getModelName(): string {
  // Allow override via .env TRANSFORMERS_NER_MODEL; default to multilingual
  return process.env.TRANSFORMERS_NER_MODEL || 'Davlan/xlm-roberta-base-ner-hrl';
}

async function loadPipeline(log?: pino.Logger): Promise<(text: string) => Promise<NerSpan[]>> {
  try {
    const { pipeline } = await import('@huggingface/transformers');
    
    const model = getModelName();
    if (log?.debug) {
      log.debug({ model, hasToken: !!process.env.HF_TOKEN }, '🤖 TRANSFORMERS: Loading NER pipeline');
    }
    
    const ner = await pipeline('token-classification', model as any, {
      // Remove quantization requirement - use default model format
    } as any);

    if (log?.debug) {
      log.debug({ model }, '✅ TRANSFORMERS: NER pipeline loaded successfully');
    }

    return async (text: string) => {
      try {
        const truncated = String(text || '').slice(0, 512);
        // @ts-ignore transformers.js aggregation API
        const out = await ner(truncated, { aggregation_strategy: 'simple' });
        const arr: NerSpan[] = Array.isArray(out)
          ? out.map((o: any) => ({
              entity_group: String(o.entity_group || o.entity || ''),
              score: Number(o.score || 0),
              text: String(o.word || o.text || ''),
            }))
          : [];
        return arr;
      } catch (e) {
        if (log?.debug) log.debug({ err: String(e) }, '❌ TRANSFORMERS: NER inference failed');
        return [];
      }
    };
  } catch (e) {
    if (log?.debug) {
      log.debug({ 
        error: String(e), 
        model: getModelName(),
        hasToken: !!process.env.HF_TOKEN 
      }, '❌ TRANSFORMERS: Pipeline loading failed');
    }
    throw e;
  }
}

export async function extractEntities(text: string, log?: pino.Logger, opts?: { timeoutMs?: number }): Promise<NerSpan[]> {
  // Skip Transformers.js in test environment to avoid runtime errors
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    if (log?.debug) {
      log.debug({ reason: 'test_environment' }, '⏭️ TRANSFORMERS: Skipping in test environment');
    }
    return [];
  }
  
  if (!nerReady) nerReady = loadPipeline(log);
  const run = await nerReady;
  const timeout = Math.max(200, Math.min(opts?.timeoutMs ?? 800, 3000));
  return withTimeout(run(text), timeout).catch(() => []);
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
