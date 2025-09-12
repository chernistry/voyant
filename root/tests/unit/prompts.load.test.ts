import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Prompt Loader', () => {
  afterEach(() => {
    delete (process as any).env.PROMPTS_DIR;
    // Ensure a fresh module instance for each test
    jest.resetModules();
  });

  it('loads policy_extractor and policy_confidence prompts from default directory', async () => {
    const prompts = await import('../../src/core/prompts.js');
    const extractor = await prompts.getPrompt('policy_extractor');
    const confidence = await prompts.getPrompt('policy_confidence');

    expect(extractor).toContain('Policy Information Extractor');
    expect(confidence).toContain('Confidence Score');
  });

  it('respects PROMPTS_DIR override', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
    writeFileSync(path.join(tmp, 'policy_extractor.md'), 'OVERRIDE extractor');
    writeFileSync(path.join(tmp, 'policy_confidence.md'), 'OVERRIDE confidence');

    (process as any).env.PROMPTS_DIR = tmp;

    const prompts = await import('../../src/core/prompts.js');
    const extractor = await prompts.getPrompt('policy_extractor');
    const confidence = await prompts.getPrompt('policy_confidence');

    expect(extractor).toBe('OVERRIDE extractor');
    expect(confidence).toBe('OVERRIDE confidence');
  });
});

