import { ChatInput, ChatOutput } from '../../src/schemas/chat.js';
import { handleChat } from '../../src/core/blend.js';
import pino from 'pino';

const log = pino({ level: 'silent' });

describe('Chat API', () => {
  test('validates input schema', () => {
    expect(() => ChatInput.parse({ message: '' })).toThrow();
    expect(() => ChatInput.parse({ message: 'a'.repeat(2001) })).toThrow();
    expect(ChatInput.parse({ message: 'Hello' })).toEqual({ message: 'Hello' });
  });

  test('validates output schema', () => {
    const valid = { reply: 'Hi there', threadId: 'abc123' };
    expect(ChatOutput.parse(valid)).toEqual(valid);
    expect(() => ChatOutput.parse({ reply: '', threadId: 'abc' })).toThrow();
  });

  test('handles basic chat flow', async () => {
    const input = { message: 'Hello' };
    const result = await handleChat(input, { log });
    
    expect(result.reply).toBeTruthy();
    expect(result.threadId).toBeTruthy();
    expect(result.threadId.length).toBeGreaterThan(0);
  });

  test('preserves threadId when provided', async () => {
    const threadId = 'test123';
    const input = { message: 'Hello', threadId };
    const result = await handleChat(input, { log });
    
    expect(result.threadId).toBe(threadId);
  });

  test('generates threadId when not provided', async () => {
    const input = { message: 'Hello' };
    const result = await handleChat(input, { log });
    
    expect(result.threadId).toBeTruthy();
    expect(result.threadId.length).toBeGreaterThan(0);
  });
});
