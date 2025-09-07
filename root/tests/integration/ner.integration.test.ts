import { extractEntities } from '../../src/core/ner.js';

describe('NER Integration', () => {
  const mockLogger = {
    debug: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts entities from fixture text with known LOC/DATE entities', async () => {
    const text = 'I want to visit Paris in December';
    
    // Set to remote mode to avoid transformers.js loading in test
    process.env.NER_MODE = 'remote';
    
    // Mock successful API response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { entity_group: 'LOC', score: 0.9, word: 'Paris' },
        { entity_group: 'DATE', score: 0.8, word: 'December' }
      ]),
    });

    const result = await extractEntities(text, mockLogger);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      entity_group: 'LOC',
      score: 0.9,
      text: 'Paris'
    });
    expect(result[1]).toEqual({
      entity_group: 'DATE',
      score: 0.8,
      text: 'December'
    });
  });

  it('produces same entity outputs as policy and router expect', async () => {
    const text = 'Travel from London to Tokyo';
    
    process.env.NER_MODE = 'remote';
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { entity_group: 'LOC', score: 0.95, word: 'London' },
        { entity_group: 'LOC', score: 0.92, word: 'Tokyo' }
      ]),
    });

    const result = await extractEntities(text, mockLogger);

    // Verify the structure matches what policy_agent.ts and router.ts expect
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_group: expect.any(String),
          score: expect.any(Number),
          text: expect.any(String)
        })
      ])
    );

    // Verify specific entities
    const locations = result.filter(e => e.entity_group === 'LOC');
    expect(locations).toHaveLength(2);
    expect(locations.map(l => l.text)).toEqual(['London', 'Tokyo']);
  });
});
