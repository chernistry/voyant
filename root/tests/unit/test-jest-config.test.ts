describe('Jest Configuration Test', () => {
  test('Jest config loads correctly', () => {
    expect(true).toBe(true);
  });

  test('TypeScript compilation works', () => {
    const message: string = 'Hello Jest!';
    expect(message).toBe('Hello Jest!');
  });

  test('Basic assertions work', () => {
    expect(1 + 1).toBe(2);
    expect([1, 2, 3]).toHaveLength(3);
    expect({ a: 1 }).toHaveProperty('a');
  });
});
