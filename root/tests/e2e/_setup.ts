import { describe, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import pino from 'pino';
import nock from 'nock';
import { router } from '../../src/api/routes.js';
import { TranscriptRecorder } from '../../src/test/transcript-recorder.js';
import { recordedRequest } from '../../src/test/transcript-helper.js';

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
  const log = pino({ level: process.env.LOG_LEVEL ?? 'debug' });
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

export const shouldSaveTranscripts: boolean =
  process.argv.includes('--save-transcripts') || process.argv.includes('--with-transcripts');

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
      const req = require('supertest')(app).post(path);
      return {
        set: (header: string, value: string) => {
          req.set(header, value);
          return {
            send: (data: any) => ({
              expect: (status: number) => {
                if (shouldSaveTranscripts && transcriptRecorder) {
                  const testName = data.message
                    ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                    : 'test_request';
                  return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
                } else {
                  return req.send(data).expect(status);
                }
              },
            }),
          };
        },
        send: (data: any) => ({
          expect: (status: number) => {
            if (shouldSaveTranscripts && transcriptRecorder) {
              const testName = data.message
                ? String(data.message).substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')
                : 'test_request';
              return recordedRequest(app, transcriptRecorder, testName, data.message, data.threadId);
            } else {
              return req.send(data).expect(status);
            }
          },
        }),
      };
    },
    get: (path: string) => ({
      expect: (status: number) => require('supertest')(app).get(path).expect(status),
    }),
  };
}

export { nock, recordedRequest, TranscriptRecorder };

