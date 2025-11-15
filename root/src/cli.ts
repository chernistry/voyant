import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import MarkdownIt from 'markdown-it';
import { handleChat } from './core/blend.js';
import { createLogger } from './util/logging.js';
import { silenceNoisyLibLogs } from './util/noise_filter.js';
import { RateLimiter } from './core/rate-limiter.js';
import { RATE_LIMITER_CONFIG } from './config/resilience.js';
import { loadSessionConfig } from './config/session.js';
import { createStore, initSessionStore } from './core/session_store.js';
import { clearThreadSlots } from './core/slot_memory.js';
import type { Decision } from './core/receipts.js';
import { incMessages, observeE2E } from './util/metrics.js';
import type { PipelineStageKey, PipelineStatusUpdate } from './core/pipeline_status.js';

// Start standalone metrics server for dashboard access
if (process.env.METRICS !== 'off') {
  import('./util/metrics-server.js').catch(() => {
    // Ignore if metrics server fails to start
  });
}

// For banner testing, exit early if BANNER_TEST env var is set
if (process.env.BANNER_TEST) {
  process.exit(0);
}

// Default push URL so CLI metrics appear on the metrics server dashboard
if (!process.env.METRICS_PUSH_URL) {
  process.env.METRICS_PUSH_URL = 'http://localhost:3001/metrics/ingest';
}

const rl = readline.createInterface({ input, output });
const log = createLogger();
let threadId = 'local';

// Initialize session store
const sessionConfig = loadSessionConfig();
const sessionStore = createStore(sessionConfig);
initSessionStore(sessionStore);

log.debug({ sessionStore: sessionConfig.kind, ttlSec: sessionConfig.ttlSec }, 'Session store initialized');

// Rate limiter for CLI commands
const cliRateLimiter = new RateLimiter(RATE_LIMITER_CONFIG);

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
});

const FRAME_BAR = '─'.repeat(44);
const PIPELINE_BAR = '─'.repeat(40);
const PIPELINE_TOP_TEXT = `┌─ PIPELINE ${PIPELINE_BAR}`;
const PIPELINE_BOTTOM_TEXT = `└${'─'.repeat(Math.max(PIPELINE_TOP_TEXT.length - 1, 0))}`;
const PIPELINE_TOP = chalk.gray(PIPELINE_TOP_TEXT);
const PIPELINE_BOTTOM = chalk.gray(PIPELINE_BOTTOM_TEXT);

type Styler = (value: string) => string;

const identity: Styler = (value: string) => value;

interface BlockParts {
  top: string;
  body: string;
  bottom: string;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#34;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match: string, hex: string) => {
      return String.fromCodePoint(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, (_match: string, dec: string) => {
      return String.fromCodePoint(Number.parseInt(dec, 10));
    })
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (entity: string): string => {
      if (Object.prototype.hasOwnProperty.call(named, entity)) {
        return named[entity]!;
      }
      return entity;
    });
}

function createBlock(title: string, message: string, accent: Styler, body: Styler): BlockParts {
  const lines = message.split('\n').map((line) => (line.length === 0 ? ' ' : line));
  const topPlain = `┌─ ${title.toUpperCase()} ${FRAME_BAR}`;
  const bottomPlain = `└${'─'.repeat(Math.max(topPlain.length - 1, 0))}`;
  const prefixed = lines
    .map((line) => `${accent('│')} ${body(line)}`)
    .join('\n');
  return {
    top: accent(topPlain),
    body: prefixed,
    bottom: accent(bottomPlain),
  };
}

function renderMarkdownToTerminal(markdown: string): string {
  // Parse markdown into HTML-like structure for easier styling
  const html = md.render(markdown);

  const formatted = html
    // Headers
    .replace(/<h1>(.*?)<\/h1>/gi, chalk.bold.blue('\n$1\n') + '='.repeat(50))
    .replace(/<h2>(.*?)<\/h2>/gi, chalk.bold.cyan('\n$1\n') + '-'.repeat(30))
    .replace(/<h3>(.*?)<\/h3>/gi, chalk.bold.yellow('\n$1'))
    .replace(/<h[4-6]>(.*?)<\/h[4-6]>/gi, chalk.bold.magenta('\n$1'))

    // Bold and italic
    .replace(/<strong>(.*?)<\/strong>/gi, chalk.bold('$1'))
    .replace(/<b>(.*?)<\/b>/gi, chalk.bold('$1'))
    .replace(/<em>(.*?)<\/em>/gi, chalk.italic('$1'))
    .replace(/<i>(.*?)<\/i>/gi, chalk.italic('$1'))

    // Code
    .replace(/<code>(.*?)<\/code>/gi, chalk.bgGray.white(' $1 '))
    .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m: string, code: string) => {
      return '\n' + chalk.bgGray.white(' ' + code.trim() + ' ') + '\n';
    })

    // Links: show both text and URL
    .replace(/<a href="([^"]+)">(.*?)<\/a>/gi, (_m: string, href: string, text: string) => {
      return chalk.blue.underline(text) + ' ' + chalk.gray('(' + href + ')');
    })

    // Lists
    .replace(/<ul>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<li>(.*?)<\/li>/gi, '  • $1\n')

    // Paragraphs
    .replace(/<p>(.*?)<\/p>/gi, '$1\n')

    // Line breaks
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')

    // Clean up remaining HTML tags
    .replace(/<\/?[^>]+(>|$)/g, '')

    // Normalize whitespace and line breaks
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return decodeHtmlEntities(formatted);
}

// Get streaming delay from environment or use default
const STREAMING_DELAY_MS = parseInt(process.env.CLI_STREAMING_DELAY_MS || '2');

async function streamText(text: string, delayMs = STREAMING_DELAY_MS) {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

class Spinner {
  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private readonly stageOrder: PipelineStageKey[] = [
    'guard',
    'parse',
    'context',
    'plan',
    'tool',
    'web-search',
    'compose',
    'verify',
    'finalize',
  ];
  private readonly stageLabels: Record<PipelineStageKey, string> = {
    guard: 'Running safety checks...',
    parse: 'Parsing your request...',
    context: 'Retrieving recent context...',
    plan: 'Planning next steps...',
    tool: 'Gathering data from tools...',
    'web-search': 'Searching the web...',
    compose: 'Drafting your answer...',
    verify: 'Verifying answer quality...',
    finalize: 'Finalizing recommendations...',
  };
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private currentStage: PipelineStageKey = 'guard';
  private customStatus: string | null = null;
  private customStatusTime = 0;
  private readonly CUSTOM_STATUS_TIMEOUT = 3000; // 3 seconds

  start() {
    this.currentFrame = 0;
    this.customStatus = null;
    this.customStatusTime = 0;
    this.currentStage = 'guard';
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      const displayStatus = this.getCurrentDisplayStatus();
      const frame = chalk.yellow(this.frames[this.currentFrame]);
      const prefix = chalk.gray('│');
      const text = chalk.gray(displayStatus);
      process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  handlePipelineUpdate(update: PipelineStatusUpdate | string) {
    if (typeof update === 'string') {
      this.setStatus(update);
      return;
    }
    if (update.stage) this.setStage(update.stage);
    if (update.message) this.setStatus(update.message);
  }

  private setStage(stage: PipelineStageKey) {
    if (this.stageOrder.includes(stage)) {
      this.currentStage = stage;
      if (this.interval && !this.customStatus) {
        const frame = chalk.yellow(this.frames[this.currentFrame]);
        const prefix = chalk.gray('│');
        const text = chalk.gray(this.getStageStatus());
        process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
      }
    }
  }

  private setStatus(status: string) {
    const newStatus = status || 'Processing...';
    this.customStatus = newStatus;
    this.customStatusTime = Date.now();
    if (this.interval) {
      const frame = chalk.yellow(this.frames[this.currentFrame]);
      const prefix = chalk.gray('│');
      const text = chalk.gray(newStatus);
      process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
    }
  }

  private getStageStatus(): string {
    return this.stageLabels[this.currentStage] || 'Processing...';
  }

  private getCurrentDisplayStatus(): string {
    if (this.customStatus && Date.now() - this.customStatusTime < this.CUSTOM_STATUS_TIMEOUT) {
      return this.customStatus;
    }
    if (this.customStatus) {
      this.customStatus = null;
    }
    return this.getStageStatus();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.customStatus = null;
      this.customStatusTime = 0;
      process.stdout.write('\r'.padEnd(50, ' ') + '\r');
    }
    this.currentStage = 'guard';
  }
}

async function main() {
  // Log startup information for debugging
  log.debug({ logLevel: process.env.LOG_LEVEL || 'error' }, 'CLI starting with log level');
  // Suppress noisy third‑party logs (e.g., Transformers dtype warnings) for non‑debug levels
  silenceNoisyLibLogs(process.env.LOG_LEVEL);
  
  // Clear any existing context from previous sessions
  try {
    await clearThreadSlots(threadId);
    log.debug({ threadId }, 'Cleared previous session context');
  } catch (error) {
    log.debug({ error }, 'Failed to clear previous context (continuing anyway)');
  }
  
  // Display banner and intro
  console.log(chalk.cyan(`
                                                          ░██
                                                          ░██
░██    ░██  ░███████  ░██    ░██  ░██████   ░████████  ░████████
░██    ░██ ░██    ░██ ░██    ░██       ░██  ░██    ░██    ░██
 ░██  ░██  ░██    ░██ ░██    ░██  ░███████  ░██    ░██    ░██
  ░██░██   ░██    ░██ ░██   ░███ ░██   ░██  ░██    ░██    ░██
   ░███     ░███████   ░█████░██  ░█████░██ ░██    ░██     ░████
                             ░██
                       ░███████

`));
  console.log(chalk.yellow.bold('✈️  VOYANT Travel Agent CLI — Ask any travel question!'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(
    chalk.white(
      chalk.green('• Weather, packing, attractions, destinations\n' +
                  '• Flights, policies, visas, web search\n') +
      chalk.blue('Commands: /why (sources),\n ') +
      // Add a tip line to encourage users to provide more context for better results
      chalk.white('Tip: For better results, add more context to your question.\n') +
      chalk.red('exit (quit)')
    )
  );
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  log.debug('CLI started. Type "exit" to quit.');
  const spinner = new Spinner();

  while (true) {
    const q = await rl.question(chalk.blue.bold('You> '));
    if (q.trim().toLowerCase() === 'exit') break;

    if (!(await cliRateLimiter.acquire())) {
      console.log(chalk.red('⚠️  Rate limit exceeded. Please wait a moment before trying again.'));
      continue;
    }

    log.debug({ message: q, threadId }, 'Processing user message');

    const userBlock = createBlock('You', q, chalk.blueBright, chalk.white);
    console.log();
    console.log(userBlock.top);
    if (userBlock.body.length > 0) console.log(userBlock.body);
    console.log(userBlock.bottom);

    let pipelineOpen = false;
    console.log(PIPELINE_TOP);
    pipelineOpen = true;

    spinner.start();
    spinner.handlePipelineUpdate({
      stage: 'guard',
      message: 'Running safety checks before planning...'
    });
    const t0 = Date.now();
    const wantReceipts = /^\s*\/why\b/i.test(q);
    let res: Awaited<ReturnType<typeof handleChat>> | null = null;
    let errorMessage: string | null = null;

    try {
      incMessages();
      res = await handleChat(
        { message: q, threadId, receipts: wantReceipts },
        {
          log,
          onStatus: (update) => spinner.handlePipelineUpdate(update),
        }
      );
      try { observeE2E(Date.now() - t0); } catch {}
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      errorMessage = `❌ Error processing request: ${details}`;
    } finally {
      spinner.stop();
      if (pipelineOpen) {
        console.log(PIPELINE_BOTTOM);
        pipelineOpen = false;
      }
      cliRateLimiter.release();
    }

    if (errorMessage) {
      console.log(chalk.red(errorMessage));
    }

    if (!res) {
      continue;
    }

    if (res.threadId && res.threadId !== threadId) {
      threadId = res.threadId;
    }

    log.debug({ threadId, responseThreadId: res.threadId }, 'cli_thread_debug');

    let outputText = res.reply;

    if (res.receipts && !wantReceipts) {
      outputText += '\n\n--- RECEIPTS ---\n';
      outputText += `Sources: ${(res.sources || []).join(', ')}\n`;
      outputText += `Decisions: ${res.receipts.decisions.map(d => {
        if (typeof d === 'string') return d;
        return `${d.action} (rationale: ${d.rationale}${d.alternatives ? `, alternatives: ${d.alternatives.join(', ')}` : ''}${d.confidence ? `, confidence: ${d.confidence}` : ''})`;
      }).join(' ')}\n`;
      outputText += `Self-Check: ${res.receipts.selfCheck.verdict}`;
      if (res.receipts.selfCheck.notes.length > 0) {
        outputText += ` (${res.receipts.selfCheck.notes.join(', ')})`;
      }
      outputText += '\n';
      outputText += `Budget: ${res.receipts.budgets.ext_api_latency_ms || 0}ms API, ~${res.receipts.budgets.token_estimate || 0} tokens`;
    }

    const renderedReply = renderMarkdownToTerminal(outputText);
    const assistantBlock = createBlock('Assistant', renderedReply, chalk.greenBright, identity);
    console.log();
    console.log(assistantBlock.top);
    if (assistantBlock.body.length > 0) {
      await streamText(`${assistantBlock.body}\n`);
    }
    console.log(assistantBlock.bottom);
    console.log();
  }
  rl.close();
}

main().catch((e) => (console.error(e), process.exit(1)));
