import { spawn } from 'node:child_process';
import path from 'node:path';

export async function nerIPC(text: string) {
  const runner = path.resolve(process.cwd(), 'scripts/transformers-child.cjs');
  const child = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'inherit'] });

  const payload = JSON.stringify({
    task: 'token-classification',
    model: 'Xenova/bert-base-multilingual-cased-ner-hrl',
    text,
  });

  return await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => (out += c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      } else {
        reject(new Error(`transformers-child exited with code ${code}`));
      }
    });
    child.stdin.end(payload);
  });
}
