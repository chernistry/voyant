import { handleChat } from '../../src/core/blend.js';
import { getContext, pushMessage } from '../../src/core/memory.js';
import pino from 'pino';

const log = pino({ level: 'silent' });

describe('Router & Memory Integration', () => {
  beforeEach(() => {
    // Clear memory store between tests
    (global as any).__memory_store__?.clear();
  });

  test('keeps context across turns', async () => {
    // First message establishes context
    let res = await handleChat({ message: 'What to pack for Tokyo in March?' }, { log });
    expect(res.reply).toBeTruthy();
    expect(typeof res.reply).toBe('string');
    const threadId = res.threadId;

    // Follow-up uses same thread
    res = await handleChat({ message: 'What about kids?', threadId }, { log });
    expect(res.threadId).toBe(threadId);
    expect(res.reply).toBeTruthy();
    expect(typeof res.reply).toBe('string');

    // Memory should contain both messages
    const context = getContext(threadId);
    expect(context).toHaveLength(4); // user1, assistant1, user2, assistant2
    expect(context[0]?.content).toBe('What to pack for Tokyo in March?');
    expect(context[2]?.content).toBe('What about kids?');
  });

  test('maintains intent context for destinations', async () => {
    let res = await handleChat({ message: 'Where should I go in June from NYC?' }, { log });
    expect(res.reply).toBeTruthy();
    const threadId = res.threadId;

    res = await handleChat({ message: 'What about budget options?', threadId }, { log });
    expect(res.threadId).toBe(threadId);
    expect(res.reply).toBeTruthy();
  });

  test('maintains intent context for attractions', async () => {
    let res = await handleChat({ message: 'What to do in Paris?' }, { log });
    expect(res.reply).toBeTruthy();
    const threadId = res.threadId;

    res = await handleChat({ message: 'Are there museums?', threadId }, { log });
    expect(res.threadId).toBe(threadId);
    expect(res.reply).toBeTruthy();
  });

  test('handles unknown intent gracefully', async () => {
    let res = await handleChat({ message: 'Random question about nothing specific' }, { log });
    expect(res.reply).toBeTruthy();
    const threadId = res.threadId;

    res = await handleChat({ message: 'I want to travel somewhere', threadId }, { log });
    expect(res.threadId).toBe(threadId);
    expect(res.reply).toBeTruthy();
  });

  test('preserves thread isolation', async () => {
    // Two separate threads should not interfere
    const res1 = await handleChat({ message: 'What to pack for Tokyo?' }, { log });
    const res2 = await handleChat({ message: 'What to pack for Paris?' }, { log });

    expect(res1.threadId).not.toBe(res2.threadId);

    const context1 = getContext(res1.threadId);
    const context2 = getContext(res2.threadId);

    // Each thread should have its own conversation
    expect(context1).toHaveLength(2); // user, assistant
    expect(context2).toHaveLength(2); // user, assistant
    expect(context1[0]?.content).toBe('What to pack for Tokyo?');
    expect(context2[0]?.content).toBe('What to pack for Paris?');
  });

  test('memory limits prevent unbounded growth', async () => {
    const threadId = 'test-thread';

    // Simulate many messages
    for (let i = 0; i < 20; i++) {
      pushMessage(threadId, { role: 'user', content: `Message ${i}` });
      pushMessage(threadId, { role: 'assistant', content: `Response ${i}` });
    }

    const context = getContext(threadId);
    // Should be limited to prevent memory issues
    expect(context.length).toBeLessThanOrEqual(16); // MAX = LIMIT * 2 = 16
  });
});
