import pino from 'pino';
import { handleChat } from '../core/blend.js';
export async function recordedRequest(app, transcriptRecorder, testCase, message, threadId) {
    const startTime = Date.now();
    const payload = { message };
    if (threadId)
        payload.threadId = threadId;
    // Direct invocation without binding to a TCP port (works in sandboxed CI)
    const log = pino({ level: process.env.LOG_LEVEL ?? 'silent' });
    const body = await handleChat(payload, { log });
    const response = { body };
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
