// Global Transformers.js environment configuration
// This must be imported before any other transformers usage
import { env } from '@huggingface/transformers';
import path from 'node:path';

// Configure immediately on import
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFS = true;
env.useFSCache = true;
env.localModelPath = path.resolve(process.cwd(), 'models');

// ARM64-specific WASM tuning
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.simd = false;
  env.backends.onnx.wasm.proxy = true;
}

console.log('🔧 Transformers.js configured for offline mode:', {
  localModelPath: env.localModelPath,
  allowRemoteModels: env.allowRemoteModels
});
