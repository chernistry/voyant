import { Express } from 'express';
import pino from 'pino';
import { TranscriptRecorder } from './transcript-recorder.js';
import { handleChat } from '../core/blend.js';

export async function recordedRequest(
  app: Express,
  transcriptRecorder: TranscriptRecorder | undefined,
  testCase: string,
  message: string,
  threadId?: string
) {
  const startTime = Date.now();
  const payload: any = { message };
  if (threadId) payload.threadId = threadId;
  // Direct invocation without binding to a TCP port (works in sandboxed CI)
  const log = pino({ level: process.env.LOG_LEVEL ?? 'silent' });
  const body = await handleChat(payload, { log });
  const response = { body } as { body: any };
  const latencyMs = Date.now() - startTime;

  if (transcriptRecorder) {
    await transcriptRecorder.recordTurn({
      testCase,
      userMessage: message,
      agentResponse: response.body,
      latencyMs,
    });
  }

  return response;
}
