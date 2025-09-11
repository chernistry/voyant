import { handleChat } from '../../src/core/blend.js';
import pino from 'pino';

const log = pino({ level: 'silent' });

describe('Simple API Tests', () => {
  test('handleChat returns valid response', async () => {
    console.log('Testing handleChat...');

    const result = await handleChat({ message: 'Hello' }, { log });

    console.log('handleChat completed');

    expect(result).toHaveProperty('reply');
    expect(result).toHaveProperty('threadId');
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(0);
    expect(typeof result.threadId).toBe('string');
  }, 30000);

  test('handleChat preserves threadId when provided', async () => {
    const threadId = 'test-thread-123';

    const result = await handleChat({ message: 'Hello', threadId }, { log });

    expect(result.threadId).toBe(threadId);
  }, 30000);

  test('handleChat generates threadId when not provided', async () => {
    const result = await handleChat({ message: 'Hello' }, { log });

    expect(result.threadId).toBeTruthy();
    expect(typeof result.threadId).toBe('string');
    expect(result.threadId.length).toBeGreaterThan(0);
  }, 30000);
});
