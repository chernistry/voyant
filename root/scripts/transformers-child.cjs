#!/usr/bin/env node
/* scripts/transformers-child.cjs */
const path = require('node:path');

// Configure environment BEFORE importing transformers
const { env } = require('@huggingface/transformers');

// Offline + local cache
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFS = true;
env.useFSCache = true;
env.localModelPath = path.resolve(process.cwd(), 'models');

// WASM knobs — proxy=true runs ORT in a worker thread
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = true;
}

// Suppress all console output to avoid corrupting JSON
const originalConsole = { ...console };
console.log = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

// Now import pipeline
const { pipeline } = require('@huggingface/transformers');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (buf += c));
process.stdin.on('end', async () => {
  try {
    const { task, model, text, candidateLabels } = JSON.parse(buf);
    const clf = await pipeline(task, model);
    
    let res;
    if (candidateLabels) {
      // Zero-shot classification
      res = await clf(text, candidateLabels);
    } else {
      // NER or other tasks
      res = await clf(text);
    }
    
    process.stdout.write(JSON.stringify(res));
  } catch (err) {
    // Restore console for error output
    Object.assign(console, originalConsole);
    console.error(err?.stack || String(err));
    process.exit(1);
  }
});
