import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TranscriptRecorder } from '../src/test/transcript-recorder.js';
import { rmdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('TranscriptRecorder', () => {
  let recorder: TranscriptRecorder;
  const outputDir = join(process.cwd(), 'deliverables', 'transcripts');

  beforeEach(() => {
    // Set environment variable to enable recording
    process.env.RECORD_TRANSCRIPTS = 'true';
    recorder = new TranscriptRecorder();
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(outputDir)) {
      await rmdir(outputDir, { recursive: true });
    }
    delete process.env.RECORD_TRANSCRIPTS;
  });

  test('should record and save transcripts when enabled', async () => {
    await recorder.recordTurn({
      testCase: 'test_case',
      userMessage: 'Hello, world!',
      agentResponse: { reply: 'Hi there!', threadId: 'test-123' },
      latencyMs: 500,
    });

    expect(recorder.getTranscriptCount()).toBe(1);

    await recorder.saveTranscripts();

    // Check if files were created
    expect(existsSync(join(outputDir, 'test_case.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'test_case.md'))).toBe(true);
  });

  test('should not record when disabled', async () => {
    process.env.RECORD_TRANSCRIPTS = 'false';
    const disabledRecorder = new TranscriptRecorder();

    await disabledRecorder.recordTurn({
      testCase: 'test_case',
      userMessage: 'Hello, world!',
      agentResponse: { reply: 'Hi there!' },
      latencyMs: 500,
    });

    expect(disabledRecorder.getTranscriptCount()).toBe(0);
  });

  test('should handle multiple turns in same test case', async () => {
    await recorder.recordTurn({
      testCase: 'multi_turn_test',
      userMessage: 'First message',
      agentResponse: { reply: 'First response' },
      latencyMs: 300,
    });

    await recorder.recordTurn({
      testCase: 'multi_turn_test',
      userMessage: 'Second message',
      agentResponse: { reply: 'Second response' },
      latencyMs: 400,
    });

    expect(recorder.getTranscriptCount()).toBe(1);

    await recorder.saveTranscripts();

    expect(existsSync(join(outputDir, 'multi_turn_test.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'multi_turn_test.md'))).toBe(true);
  });
});
