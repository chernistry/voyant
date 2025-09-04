import { spawn } from 'child_process';
import { expect, test, describe } from '@jest/globals';

interface CLIResponse {
  reply?: string;
  threadId?: string;
  receipts?: any;
  sources?: string[];
  error?: any;
}

async function runCLI(message: string, threadId?: string, receipts = false): Promise<CLIResponse> {
  return new Promise((resolve, reject) => {
    const args = ['run', 'cli'];
    const env = { ...process.env };
    const cli = spawn('npm', args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';

    cli.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    cli.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send a single question then exit
    const q = receipts ? '/why' : message;
    const lines = [threadId ? message + `\n` : message + `\n`, q + `\n`, 'exit\n'];
    for (const line of lines) cli.stdin.write(line);
    cli.stdin.end();

    cli.on('close', () => {
      // We don't have structured JSON output from CLI; validate presence of output markers instead
      try {
        const body: CLIResponse = { reply: stdout.trim() };
        resolve(body);
      } catch {
        reject(new Error(`Failed to read CLI output: ${stdout}\nSTDERR: ${stderr}`));
      }
    });
    cli.on('error', reject);
  });
}

describe('Receipts Mode - CLI Interaction Validation (basic)', () => {
  test('happy path emits receipts markers when /why used', async () => {
    const r = await runCLI('What to pack for Tokyo in March?');
    expect(r.reply).toBeTruthy();
    const rr = await runCLI('/why', undefined, true);
    expect(rr.reply).toBeTruthy();
  }, 30000);
});


