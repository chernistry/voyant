import request from 'supertest';
export async function recordedRequest(app, transcriptRecorder, testCase, message, threadId) {
    const startTime = Date.now();
    const payload = { message };
    if (threadId)
        payload.threadId = threadId;
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
