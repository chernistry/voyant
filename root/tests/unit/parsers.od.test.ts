describe('Origin/Destination Parser - Regex Patterns', () => {
  it('should extract origin and destination from regex patterns', () => {
    const text1 = 'from Boston to Tokyo in June';
    const fromMatch = text1.match(/\bfrom\s+([A-Z][A-Za-z\- ]+?)(?:\s+to|\s+in|$)/i);
    const toMatch = text1.match(/\bto\s+([A-Z][A-Za-z\- ]+?)(?:\s+in|$)/i);
    
    expect(fromMatch?.[1]?.trim()).toBe('Boston');
    expect(toMatch?.[1]?.trim()).toBe('Tokyo');
  });

  it('should extract destination from "in" pattern', () => {
    const text = 'hotels in Rome';
    const inMatch = text.match(/\bin\s+([A-Z][A-Za-z\- ]+)/i);
    
    expect(inMatch?.[1]?.trim()).toBe('Rome');
  });

  it('should handle case insensitive patterns', () => {
    const text = 'FROM london TO paris';
    const fromMatch = text.match(/\bfrom\s+([A-Za-z\- ]+?)(?:\s+to|$)/i);
    const toMatch = text.match(/\bto\s+([A-Za-z\- ]+?)(?:$)/i);
    
    expect(fromMatch?.[1]?.trim()).toBe('london');
    expect(toMatch?.[1]?.trim()).toBe('paris');
  });

  it('should not match when no prepositions present', () => {
    const text = 'just some random text';
    const fromMatch = text.match(/\bfrom\s+([A-Z][A-Za-z\- ]+)/i);
    const toMatch = text.match(/\bto\s+([A-Z][A-Za-z\- ]+)/i);
    const inMatch = text.match(/\bin\s+([A-Z][A-Za-z\- ]+)/i);
    
    expect(fromMatch).toBeNull();
    expect(toMatch).toBeNull();
    expect(inMatch).toBeNull();
  });

  it('should handle simple patterns correctly', () => {
    const text1 = 'from Madrid to Barcelona';
    const fromMatch = text1.match(/\bfrom\s+([A-Z][A-Za-z\- ]+?)(?:\s+to|$)/i);
    const toMatch = text1.match(/\bto\s+([A-Z][A-Za-z\- ]+?)(?:$)/i);
    
    expect(fromMatch?.[1]?.trim()).toBe('Madrid');
    expect(toMatch?.[1]?.trim()).toBe('Barcelona');
  });
});
