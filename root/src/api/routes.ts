import type { Router } from 'express';
import express from 'express';
import type pino from 'pino';
import { ChatInput, ChatOutput } from '../schemas/chat.js';
import { handleChat } from '../core/blend.js';
import { getPrometheusText, metricsMode, snapshot, incMessages } from '../util/metrics.js';
import { buildReceiptsSkeleton, ReceiptsSchema } from '../core/receipts.js';
import { getLastReceipts } from '../core/slot_memory.js';
import { verifyAnswer } from '../core/verify.js';

export const router = (log: pino.Logger): Router => {
  const r = express.Router();
  r.post('/chat', async (req, res) => {
    const parsed = ChatInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      incMessages();
      const out = await handleChat(parsed.data, { log });
      // Build receipts only when requested via flag or '/why' command
      const wantReceipts = Boolean(parsed.data.receipts) ||
        /^\s*\/why\b/i.test(parsed.data.message);
      if (!wantReceipts) {
        return res.json(out);
      }
      const receiptsData = getLastReceipts(out.threadId) || {};
      const facts = receiptsData.facts || [];
      const decisions = receiptsData.decisions || [];
      const lastReply = receiptsData.reply;
      const token_estimate = 400;
      const receipts = buildReceiptsSkeleton(facts, decisions, token_estimate);
      // Self-check second pass
      try {
        const audit = await verifyAnswer({
          reply: lastReply ?? out.reply,
          facts: facts as Array<{ key: string; value: unknown; source: string }>,
          log
        });
        const merged = {
          ...receipts,
          selfCheck: { verdict: audit.verdict, notes: audit.notes }
        };
        let finalReply = out.reply;
        if (audit.verdict === 'fail' && audit.revisedAnswer) {
          finalReply = audit.revisedAnswer;
        }
        const safe = ReceiptsSchema.parse(merged);
        const response = {
          ...out,
          reply: finalReply,
          sources: receipts.sources,
          receipts: safe
        };
        return res.json(ChatOutput.parse(response));
      } catch {
        // If receipts generation fails, return normal response
        return res.json(out);
      }
    } catch (err: unknown) {
      log.error({ err }, 'chat failed');
      return res.status(500).json({ error: 'internal_error' });
    }
  });
  // Optional /metrics endpoint
  r.get('/metrics', async (_req, res) => {
    const mode = metricsMode();
    if (mode === 'prom') {
      const text = await getPrometheusText();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.status(200).send(text);
    }
    // Always provide JSON snapshot when Prometheus is not enabled
    return res.json(snapshot());
  });
  return r;
};

