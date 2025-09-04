import pino from 'pino';
import { scrubMessage, scrubPII } from './redact.js';

/**
 * Creates a pino logger with PII redaction unless LOG_LEVEL=debug.
 */
export function createLogger() {
  const level = process.env.LOG_LEVEL ?? 'info';
  const redactEnabled = level !== 'debug';
  // Use pino hooks to scrub arguments before logging
  const log = pino({
    level,
    hooks: {
      logMethod(args: unknown[], method: (...a: unknown[]) => void) {
        try {
          const scrubbed = args.map((a) =>
            typeof a === 'string' ? scrubMessage(a, redactEnabled) : scrubPII(a, redactEnabled),
          );
          method.apply(this, scrubbed as unknown[]);
        } catch {
          method.apply(this, args as unknown[]);
        }
      },
    },
  } as pino.LoggerOptions);
  return log;
}


