// spawnable NER microservice (Node process)
import pino from 'pino';
import { pipeline } from '@huggingface/transformers';

const log = pino({ level: 'info' });
let ner: any;

(async () => {
  ner = await pipeline('token-classification', 'Xenova/bert-base-multilingual-cased-ner-hrl', {aggregation_strategy: 'simple'});
  process.send?.({ ready: true });
})();

process.on('message', async (msg) => {
  if (msg?.cmd === 'ner' && typeof msg.text === 'string') {
    try {
      const out = await ner(msg.text.slice(0, 512));
      process.send?.({ ok: true, out });
    } catch (err: any) {
      log.error({ err }, 'NER failed');
      process.send?.({ ok: false, err: String(err?.message || err) });
    }
  }
});
