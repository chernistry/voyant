import 'dotenv/config';
let nerReady = null;
function getModelName() {
    // Allow override via .env TRANSFORMERS_NER_MODEL; default to multilingual
    return process.env.TRANSFORMERS_NER_MODEL || 'Davlan/xlm-roberta-base-ner-hrl';
}
async function loadPipeline(log) {
    try {
        const { pipeline } = await import('@huggingface/transformers');
        const model = getModelName();
        if (log?.debug) {
            log.debug({ model, hasToken: !!process.env.HF_TOKEN }, '🤖 TRANSFORMERS: Loading NER pipeline');
        }
        // Suppress console output from transformers.js if LOG_LEVEL is info or higher
        const originalConsole = { ...console };
        const shouldSuppressConsole = process.env.LOG_LEVEL === 'info' || process.env.LOG_LEVEL === 'warn' || process.env.LOG_LEVEL === 'error';
        if (shouldSuppressConsole) {
            console.log = () => { };
            console.warn = () => { };
            console.info = () => { };
        }
        const ner = await pipeline('token-classification', model, {
        // Remove quantization requirement - use default model format
        });
        // Restore console
        if (shouldSuppressConsole) {
            Object.assign(console, originalConsole);
        }
        if (log?.debug) {
            log.debug({ model }, '✅ TRANSFORMERS: NER pipeline loaded successfully');
        }
        return async (text) => {
            try {
                const truncated = String(text || '').slice(0, 512);
                // @ts-ignore transformers.js aggregation API
                const out = await ner(truncated, { aggregation_strategy: 'simple' });
                const arr = Array.isArray(out)
                    ? out.map((o) => ({
                        entity_group: String(o.entity_group || o.entity || ''),
                        score: Number(o.score || 0),
                        text: String(o.word || o.text || ''),
                    }))
                    : [];
                return arr;
            }
            catch (e) {
                if (log?.debug)
                    log.debug({ err: String(e) }, '❌ TRANSFORMERS: NER inference failed');
                return [];
            }
        };
    }
    catch (e) {
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
export async function extractEntities(text, log, opts) {
    // Use IPC worker in test environment to avoid Jest/ORT typed array issues
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        try {
            const { nerIPC } = await import('./ner-ipc.js');
            const spans = await nerIPC(String(text || ''));
            return Array.isArray(spans) ? spans.map((o) => ({
                entity_group: String(o.entity_group || o.entity || ''),
                score: Number(o.score || 0),
                text: String(o.word || o.text || ''),
            })) : [];
        }
        catch (error) {
            if (log?.debug) {
                log.debug({ error: String(error) }, '❌ TRANSFORMERS: IPC worker failed');
            }
            return [];
        }
    }
    if (!nerReady)
        nerReady = loadPipeline(log);
    const run = await nerReady;
    const timeout = Math.max(200, Math.min(opts?.timeoutMs ?? 800, 3000));
    return withTimeout(run(text), timeout).catch(() => []);
}
async function withTimeout(p, ms) {
    let t;
    return await Promise.race([
        p.finally(() => t && clearTimeout(t)),
        new Promise((_, rej) => {
            t = setTimeout(() => rej(new Error('timeout')), ms);
        }),
    ]);
}
