import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import pino from 'pino';
import nock from 'nock';
import fs from 'fs/promises';
import path from 'path';

import { router } from '../src/api/routes.js';
import { expectLLMEvaluation } from '../src/test/llm-evaluator.js';
import { TranscriptRecorder } from '../src/test/transcript-recorder.js';
import { recordedRequest } from '../src/test/transcript-helper.js';

type CsvRowObject = Record<string, string>;

const CSV_PATH = 'tests/demo_scenario.csv';

// Configure nock similar to e2e_comprehensive_flow: block external except localhost and openrouter
nock.disableNetConnect();
nock.enableNetConnect((host) => 
  host.includes('127.0.0.1') || 
  host.includes('localhost') || 
  host.includes('openrouter.ai') ||
  host.includes('api.search.brave.com') ||
  host.includes('api.open-meteo.com') ||
  host.includes('geocoding-api.open-meteo.com') ||
  host.includes('restcountries.com') ||
  host.includes('api.opentripmap.com')
);

const log = pino({ level: process.env.LOG_LEVEL ?? 'debug' });

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router(log));
  return app;
}

// Enable debug logging for this test
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';

// Transcript control
const shouldSaveTranscripts = process.argv.includes('--save-transcripts') || process.argv.includes('--with-transcripts');

function sanitizeThreadIdPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

function csvEscape(value: string): string {
  if (value === undefined || value === null) return '';
  const needsQuotes = /[",\n]/.test(value);
  let escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/);
  const rows: string[][] = [];
  let headers: string[] = [];

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === ',') {
          result.push(current);
          current = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  for (const line of lines) {
    if (line.trim() === '') continue;
    const parsed = parseLine(line);
    if (headers.length === 0) {
      headers = parsed;
    } else {
      // Pad to headers length
      while (parsed.length < headers.length) parsed.push('');
      rows.push(parsed);
    }
  }
  return { headers, rows };
}

function rowsToObjects(headers: string[], rows: string[][]): CsvRowObject[] {
  return rows.map((r) => {
    const obj: CsvRowObject = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}

function objectsToRows(headers: string[], objects: CsvRowObject[]): string[][] {
  return objects.map((obj) => headers.map((h) => obj[h] ?? ''));
}

async function readCsvAsObjects(filePath: string): Promise<{ headers: string[]; objects: CsvRowObject[] }>{
  const content = await fs.readFile(filePath, 'utf8');
  const { headers, rows } = parseCsv(content);
  const objects = rowsToObjects(headers, rows);
  return { headers, objects };
}

async function writeObjectsAsCsv(filePath: string, headers: string[], objects: CsvRowObject[]): Promise<void> {
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const obj of objects) {
    const row = headers.map((h) => csvEscape(obj[h] ?? ''));
    lines.push(row.join(','));
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
}

function ensureColumns(headers: string[], required: string[]): { headers: string[]; added: string[] } {
  const out = [...headers];
  const added: string[] = [];
  for (const col of required) {
    if (!out.includes(col)) {
      out.push(col);
      added.push(col);
    }
  }
  return { headers: out, added };
}

function buildExpectedCriteria(row: CsvRowObject): string {
  const expectations: string[] = [];
  const expectedReply = (row['expected_agent_reply'] || '').trim();
  const capability = (row['capability_shown'] || '').trim();
  const expectedCitations = (row['expected_citations'] || '').trim();

  if (expectedReply && expectedReply !== '-') {
    expectations.push(`Match the intent and content of: ${expectedReply}`);
  }
  if (capability) {
    expectations.push(`Demonstrate capability: ${capability}`);
  }
  if (expectedCitations) {
    expectations.push(`If external facts are used, include citations for: ${expectedCitations}`);
  }
  if (expectations.length === 0) {
    expectations.push('Provide a helpful, relevant travel assistant response with no chain-of-thought leakage.');
  }
  return expectations.join('\n- ');
}

function combineActualForEvaluation(reply: string, citations?: unknown): string {
  const c = Array.isArray(citations) ? citations.join(', ') : '';
  return c ? `${reply}\nCITATIONS: ${c}` : reply;
}

describe('Demo Scenario CSV-driven Flow', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder | undefined;
  let csvHeaders: string[] = [];
  let csvObjects: CsvRowObject[] = [];

  beforeAll(async () => {
    if (shouldSaveTranscripts) {
      transcriptRecorder = new TranscriptRecorder();
      console.log('📝 Transcript saving enabled');
    } else {
      console.log('📝 Transcript saving disabled (use --save-transcripts to enable)');
    }

    // Load CSV
    const { headers, objects } = await readCsvAsObjects(CSV_PATH);
    csvHeaders = headers;
    csvObjects = objects;

    // Ensure required columns exist
    const required = [
      'actual_agent_reply',
      'llm_eval_pass',
      'llm_eval_confidence',
      'llm_eval_reason',
      'thread_id',
      'actual_citations'
    ];
    const ensured = ensureColumns(csvHeaders, required);
    if (ensured.added.length > 0) {
      csvHeaders = ensured.headers;
      // Initialize new columns to empty
      csvObjects.forEach((o) => ensured.added.forEach((col) => (o[col] = o[col] ?? '')));
      await writeObjectsAsCsv(CSV_PATH, csvHeaders, csvObjects);
      console.log(`🗂️ Added missing CSV columns: ${ensured.added.join(', ')}`);
    }
  });

  afterAll(async () => {
    if (transcriptRecorder) {
      await transcriptRecorder.saveTranscripts();
      console.log('💾 Transcripts saved to deliverables/transcripts/');
    }
  });

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // Group rows by scenario and sort by step
  const scenarios = new Map<string, CsvRowObject[]>();
  
  // We'll load and group within a beforeAll-like sync block using file content loaded earlier in beforeAll.
  // Jest evaluates tests at definition time, but we will define a single test that runs the grouped flow to keep things simple.

  test('runs CSV scenarios end-to-end with LLM self-evaluation', async () => {
    if (csvObjects.length === 0) {
      const { headers, objects } = await readCsvAsObjects(CSV_PATH);
      csvHeaders = headers;
      csvObjects = objects;
    }

    for (const row of csvObjects) {
      const scenario = (row['scenario'] || 'default').trim();
      if (!scenarios.has(scenario)) scenarios.set(scenario, []);
      scenarios.get(scenario)!.push(row);
    }

    // Execute each scenario in sequence to preserve thread context
    for (const [scenarioName, rows] of scenarios) {
      // Create a stable thread id per scenario
      const threadId = `${sanitizeThreadIdPart(scenarioName)}_${Date.now().toString(36)}`.slice(0, 64);
      console.log(`\n📖 Scenario: ${scenarioName} (thread: ${threadId})`);

      // Sort by numeric step if available
      rows.sort((a, b) => {
        const sa = parseInt(a['step'] || '0', 10);
        const sb = parseInt(b['step'] || '0', 10);
        return sa - sb;
      });

      for (const row of rows) {
        const actor = (row['actor'] || '').trim().toLowerCase();
        const message = (row['message'] || '').trim();
        if (actor !== 'user' || !message) {
          continue; // Only process user messages with content
        }

        const stepNum = row['step'] || '';
        const testName = `${sanitizeThreadIdPart(scenarioName)}_step_${stepNum}_${sanitizeThreadIdPart(message).slice(0, 24)}`;

        // Send request using transcript-aware helper
        const res = await recordedRequest(app, transcriptRecorder, testName, message, threadId);

        const reply: string = String(res.body?.reply ?? '');
        const citations: string[] = Array.isArray(res.body?.citations) ? res.body.citations : [];

        // Log to console
        console.log(`\n➡️  User: ${message}`);
        console.log(`⬅️  Agent: ${reply}`);
        if (citations.length) {
          console.log(`📚 Citations: ${citations.join(', ')}`);
        }

        // Update row fields
        row['actual_agent_reply'] = reply;
        row['actual_citations'] = citations.join('; ');
        row['thread_id'] = threadId;

        // LLM self-evaluation
        const expectedCriteria = buildExpectedCriteria(row);
        const actualForEval = combineActualForEvaluation(reply, citations);

        try {
          const result = await expectLLMEvaluation(
            `${scenarioName} - step ${stepNum}`,
            actualForEval,
            expectedCriteria
          ).toPass();
          row['llm_eval_pass'] = 'true';
          row['llm_eval_confidence'] = String(result.confidence ?? '');
          row['llm_eval_reason'] = result.reason ?? '';
          console.log(`✅ LLM Eval PASS (conf: ${row['llm_eval_confidence']}) — ${row['llm_eval_reason']}`);
        } catch (err: any) {
          row['llm_eval_pass'] = 'false';
          row['llm_eval_confidence'] = '';
          row['llm_eval_reason'] = String(err?.message ?? err ?? '');
          console.log(`❌ LLM Eval FAIL — ${row['llm_eval_reason']}`);
          // Re-throw to fail the Jest test but still attempt to persist CSV update below
          // We'll write partial progress before throwing
          await writeObjectsAsCsv(CSV_PATH, csvHeaders, csvObjects);
          throw err;
        }

        // Persist CSV after each step for traceability
        await writeObjectsAsCsv(CSV_PATH, csvHeaders, csvObjects);
      }
    }

    // Final save to ensure file is updated
    await writeObjectsAsCsv(CSV_PATH, csvHeaders, csvObjects);

    // Basic expectation that at least one scenario existed
    expect(scenarios.size).toBeGreaterThan(0);
  }, 300000); // Allow longer timeout for full CSV run
});


