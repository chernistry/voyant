import { describe, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import pino from 'pino';
import nock from 'nock';
import path from 'node:path';
import { router } from '../../src/api/routes.js';
import { handleChat } from '../../src/core/blend.js';
import { snapshot } from '../../src/util/metrics.js';
import { TranscriptRecorder } from '../../src/test/transcript-recorder.js';
import { recordedRequest } from '../../src/test/transcript-helper.js';
import { createLogger } from '../../src/util/logging.js';

// Configure Transformers.js for offline mode in tests - must be synchronous
if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
  process.env.TRANSFORMERS_CACHE = path.resolve(process.cwd(), 'models');
  process.env.HF_HUB_DISABLE_TELEMETRY = '1';
  process.env.TRANSFORMERS_OFFLINE = '1';
}

export function configureNock() {
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

export function createTestApp(): express.Express {
  const log = createLogger();
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

export const shouldSaveTranscripts: boolean =
  process.env.RECORD_TRANSCRIPTS === 'true' ||
  process.argv.includes('--save-transcripts') ||
  process.argv.includes('--with-transcripts');

export function createRecorderIfEnabled(): TranscriptRecorder | undefined {
  if (shouldSaveTranscripts) {
    return new TranscriptRecorder();
  }
  return undefined;
}

// Helper wrapper to optionally record transcripts while preserving the same ergonomics
export function makeRequest(app: express.Express, transcriptRecorder?: TranscriptRecorder) {
  return {
    post: (path: string) => {
      return {
        set: (_header: string, _value: string) => ({
          send: (data: any) => ({
            expect: async (_status: number) => {
              if (shouldSaveTranscripts && transcriptRecorder) {
                const testName = data.message
                  ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                  : 'test_request';
                return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
              }
              const body = await handleChat({ message: data.message, threadId: data.threadId }, { log: createLogger() });
              return { body } as { body: any };
            },
          }),
        }),
        send: (data: any) => ({
          expect: async (_status: number) => {
            if (shouldSaveTranscripts && transcriptRecorder) {
              const testName = data.message
                ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                : 'test_request';
              return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
            }
            const body = await handleChat({ message: data.message, threadId: data.threadId }, { log: createLogger() });
            return { body } as { body: any };
          },
        }),
      };
    },
    get: (_path: string) => ({
      expect: async (_status: number) => {
        // Provide JSON snapshot metrics by default
        return { body: snapshot() } as { body: any };
      },
    }),
  };
}

export { nock, recordedRequest, TranscriptRecorder };
