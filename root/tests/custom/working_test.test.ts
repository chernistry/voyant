describe('Working Test Suite', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle strings', () => {
    const message = 'Hello World';
    expect(message).toContain('Hello');
    expect(message.length).toBeGreaterThan(0);
  });

  test('should handle objects', () => {
    const obj = { reply: 'test', threadId: '123' };
    expect(obj).toHaveProperty('reply');
    expect(obj).toHaveProperty('threadId');
    expect(typeof obj.reply).toBe('string');
  });
});
