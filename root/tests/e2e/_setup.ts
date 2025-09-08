// ✅ Configure Transformers.js FIRST, before other imports
const { env } = require('@huggingface/transformers');
const path = require('path');

// Local-only models + WASM backend knobs
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFS = true;
env.useFSCache = true;
env.localModelPath = path.resolve(process.cwd(), 'models');

// ARM64-specific WASM tuning
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;     // Single thread for stability
  env.backends.onnx.wasm.simd = false;       // Disable SIMD on ARM64
  env.backends.onnx.wasm.proxy = false;      // Direct execution
}

// (now it's safe to import the rest of your test deps)
const { describe, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const express = require('express');
const pino = require('pino');
const nock = require('nock');
const { router } = require('../../src/api/routes.js');
const { handleChat } = require('../../src/core/blend.js');
const { snapshot } = require('../../src/util/metrics.js');
const { TranscriptRecorder } = require('../../src/test/transcript-recorder.js');
const { recordedRequest } = require('../../src/test/transcript-helper.js');
const { createLogger } = require('../../src/util/logging.js');

function configureNock() {
  // Configure nock to work with undici and allow only whitelisted hosts
  nock.disableNetConnect();
  nock.enableNetConnect((host) => {
    if (host.includes('127.0.0.1') || host.includes('localhost')) return true;
    if (host.includes('openrouter.ai')) return true;
    if (host.includes('api.open-meteo.com')) return true;
    if (host.includes('geocoding-api.open-meteo.com')) return true;
    if (host.includes('restcountries.com')) return true;
    if (host.includes('api.opentripmap.com')) return true;
    if (host.includes('api.search.brave.com')) return true;
    return false;
  });
}

function createTestApp() {
  const log = createLogger();
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

const shouldSaveTranscripts = 
  process.env.RECORD_TRANSCRIPTS === 'true' ||
  process.argv.includes('--save-transcripts') ||
  process.argv.includes('--with-transcripts');

function createRecorderIfEnabled() {
  if (shouldSaveTranscripts) {
    return new TranscriptRecorder();
  }
  return undefined;
}

// Helper wrapper to optionally record transcripts while preserving the same ergonomics
function makeRequest(app, transcriptRecorder) {
  return {
    post: (path) => {
      return {
        set: (_header, _value) => ({
          send: (data) => ({
            expect: async (_status) => {
              if (shouldSaveTranscripts && transcriptRecorder) {
                const testName = data.message
                  ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                  : 'test_request';
                return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
              }
              const body = await handleChat({ message: data.message, threadId: data.threadId }, { log: createLogger() });
              return { body };
            },
          }),
        }),
        send: (data) => ({
          expect: async (_status) => {
            if (shouldSaveTranscripts && transcriptRecorder) {
              const testName = data.message
                ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                : 'test_request';
              return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
            }
            const body = await handleChat({ message: data.message, threadId: data.threadId }, { log: createLogger() });
            return { body };
          },
        }),
      };
    },
    get: (_path) => ({
      expect: async (_status) => {
        // Provide JSON snapshot metrics by default
        return { body: snapshot() };
      },
    }),
  };
}

module.exports = { 
  configureNock, 
  createTestApp, 
  shouldSaveTranscripts, 
  createRecorderIfEnabled, 
  makeRequest, 
  nock, 
  recordedRequest, 
  TranscriptRecorder 
};
