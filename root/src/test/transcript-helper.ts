import request from 'supertest';
import { Express } from 'express';
import { TranscriptRecorder } from './transcript-recorder.js';

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
  
  const response = await request(app).post('/chat').send(payload).expect(200);
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
