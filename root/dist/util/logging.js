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
            logMethod(args, method) {
                try {
                    const scrubbed = args.map((a) => typeof a === 'string' ? scrubMessage(a, redactEnabled) : scrubPII(a, redactEnabled));
                    method.apply(this, scrubbed);
                }
                catch {
                    method.apply(this, args);
                }
            },
        },
    });
    return log;
}
