import 'dotenv/config';
let nerReady = null;
function getModelName() {
    // Allow override via .env TRANSFORMERS_NER_MODEL; default to multilingual
    return process.env.TRANSFORMERS_NER_MODEL || 'Davlan/xlm-roberta-base-ner-hrl';
}
async function loadPipeline(log) {
    const { pipeline } = await import('@huggingface/transformers');
    const model = getModelName();
    const ner = await pipeline('token-classification', model, {
        dtype: 'q4',
    });
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
            if (log && log.debug)
                log.debug({ err: String(e) }, 'transformers_ner_failed');
            return [];
        }
    };
}
export async function extractEntities(text, log, opts) {
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
