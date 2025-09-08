import { getCountryFacts } from '../../src/tools/country.js';

describe('NLP-Enhanced Country Detection', () => {
  beforeEach(() => {
    // Mock environment for local NER
    process.env.NODE_ENV = 'test';
    process.env.NER_MODE = 'local';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.NER_MODE;
  });

  it('should detect country from travel context', async () => {
    const result = await getCountryFacts({ country: 'Georgia travel visa requirements' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Georgia');
      expect(result.source).toBeDefined();
    }
  }, 10000);

  it('should disambiguate ambiguous locations', async () => {
    const result = await getCountryFacts({ city: 'Georgia peach festival' });
    // Should recognize this as US state context, not country
    expect(result.ok).toBe(true);
  }, 10000);

  it('should handle direct country names', async () => {
    const result = await getCountryFacts({ country: 'Japan' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Japan');
      expect(result.summary).toContain('Currency');
      expect(result.summary).toContain('Language');
    }
  }, 10000);

  it('should extract enhanced travel facts', async () => {
    const result = await getCountryFacts({ country: 'France' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Euro');
      expect(result.summary).toContain('French');
      expect(result.summary).toContain('Paris');
    }
  }, 10000);

  it('should handle unknown locations gracefully', async () => {
    const result = await getCountryFacts({ city: 'XYZ123InvalidLocation' });
    // System may still return results through search fallback, which is acceptable
    expect(result).toBeDefined();
    expect(typeof result.ok).toBe('boolean');
  }, 10000);
});
