// Mock transformers.js before importing
jest.mock('@huggingface/transformers', () => ({
  pipeline: jest.fn(),
}));

// Mock ner-ipc before importing
jest.mock('../../src/core/ner-ipc.js', () => ({
  nerIPC: jest.fn(),
}));

import { extractEntities } from '../../src/core/ner.js';
import type { NerSpan } from '../../src/core/ner.js';

// Mock fetch for remote API
global.fetch = jest.fn();

describe('NER Facade', () => {
  const mockLogger = {
    debug: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NER_MODE;
    delete process.env.TRANSFORMERS_NER_MODEL;
    delete process.env.HF_TOKEN;
    delete process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;
    delete process.env.LOG_LEVEL;
  });

  describe('mode selection', () => {
    it('uses remote mode when NER_MODE=remote', async () => {
      process.env.NER_MODE = 'remote';
      process.env.HF_TOKEN = 'test-token';
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { entity_group: 'LOC', score: 0.8, word: 'London' }
        ]),
      });

      const result = await extractEntities('Visit London', mockLogger);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('huggingface.co'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual([
        { entity_group: 'LOC', score: 0.8, text: 'London' }
      ]);
    });

    it('uses local in test environment with auto mode', async () => {
      process.env.NER_MODE = 'auto';
      process.env.NODE_ENV = 'test';
      
      const { nerIPC } = await import('../../src/core/ner-ipc.js');
      (nerIPC as jest.Mock).mockResolvedValue([
        { entity_group: 'LOC', score: 0.9, text: 'Berlin' }
      ]);

      const result = await extractEntities('Visit Berlin', mockLogger);

      expect(nerIPC).toHaveBeenCalledWith('Visit Berlin');
      expect(result).toEqual([
        { entity_group: 'LOC', score: 0.9, text: 'Berlin' }
      ]);
    });

    it('uses remote in production with auto mode', async () => {
      process.env.NER_MODE = 'auto';
      process.env.NODE_ENV = 'production';
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { entity_group: 'PER', score: 0.7, word: 'John' }
        ]),
      });

      const result = await extractEntities('Hello John', mockLogger);

      expect(global.fetch).toHaveBeenCalled();
      expect(result).toEqual([
        { entity_group: 'PER', score: 0.7, text: 'John' }
      ]);
    });
  });

  describe('text truncation', () => {
    it('truncates text to 512 characters', async () => {
      process.env.NER_MODE = 'remote';
      
      const longText = 'a'.repeat(600);
      const expectedTruncated = 'a'.repeat(512);
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await extractEntities(longText, mockLogger);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ inputs: expectedTruncated }),
        })
      );
    });
  });

  describe('timeout handling', () => {
    it('handles remote API timeout', async () => {
      process.env.NER_MODE = 'remote';
      
      // Mock fetch to timeout after 6 seconds (longer than our 5s timeout)
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      const result = await extractEntities('test', mockLogger);

      expect(result).toEqual([]);
    }, 8000); // 8s timeout for this test
  });

  describe('error handling', () => {
    it('returns empty array on remote API failure', async () => {
      process.env.NER_MODE = 'remote';
      
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await extractEntities('test', mockLogger);

      expect(result).toEqual([]);
    });

    it('handles 503 model loading response', async () => {
      process.env.NER_MODE = 'remote';
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await extractEntities('test', mockLogger);

      expect(result).toEqual([]);
    });

    it('auto-fallback from local to remote on failure', async () => {
      process.env.NER_MODE = 'auto';
      process.env.NODE_ENV = 'production';
      
      // Mock remote success for fallback
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { entity_group: 'LOC', score: 0.8, word: 'Tokyo' }
        ]),
      });

      const result = await extractEntities('Visit Tokyo', mockLogger);

      expect(result).toEqual([
        { entity_group: 'LOC', score: 0.8, text: 'Tokyo' }
      ]);
    });
  });

  describe('input validation', () => {
    it('returns empty array for empty text', async () => {
      const result = await extractEntities('', mockLogger);
      expect(result).toEqual([]);
    });

    it('returns empty array for non-string input', async () => {
      const result = await extractEntities(null as any, mockLogger);
      expect(result).toEqual([]);
    });
  });

  describe('output normalization', () => {
    it('normalizes entity fields consistently', async () => {
      process.env.NER_MODE = 'remote';
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { entity: 'PERSON', score: '0.9', text: 'Alice' }, // Different field names
          { entity_group: 'LOC', score: 0.8, word: 'NYC' },  // Mixed types
        ]),
      });

      const result = await extractEntities('Alice in NYC', mockLogger);

      expect(result).toEqual([
        { entity_group: 'PERSON', score: 0.9, text: 'Alice' },
        { entity_group: 'LOC', score: 0.8, text: 'NYC' },
      ]);
    });
  });
});
