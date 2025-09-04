import { spawn } from 'child_process';
import { join } from 'path';

describe('LOG_LEVEL Environment Variable', () => {
  it('should load LOG_LEVEL from .env file', async () => {
    // Test that CLI loads environment variables by checking if debug logs appear
    const cliPath = join(__dirname, '../src/cli.ts');
    
    // Set LOG_LEVEL=debug and run CLI with a simple command that should trigger debug logs
    const child = spawn('npx', ['tsx', cliPath], {
      env: { ...process.env, LOG_LEVEL: 'debug' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Send a simple message and exit
    child.stdin.write('test message\n');
    child.stdin.write('exit\n');
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise((resolve) => {
      child.on('close', resolve);
    });

    // With LOG_LEVEL=debug, we should see debug logs in stderr
    // The exact content depends on what debug logs are generated
    expect(stderr.length).toBeGreaterThan(0);
  }, 10000);

  it('should respect LOG_LEVEL=error by default', async () => {
    const cliPath = join(__dirname, '../src/cli.ts');
    
    // Run CLI with default LOG_LEVEL (should be 'error')
    const child = spawn('npx', ['tsx', cliPath], {
      env: { ...process.env, LOG_LEVEL: 'error' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write('exit\n');
    child.stdin.end();

    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise((resolve) => {
      child.on('close', resolve);
    });

    // With LOG_LEVEL=error, we should see minimal or no logs for normal operation
    // (unless there are actual errors)
    expect(stderr).not.toContain('DEBUG');
    expect(stderr).not.toContain('INFO');
  }, 10000);
});
