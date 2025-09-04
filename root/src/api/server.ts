import 'dotenv/config';
import express from 'express';
import { createLogger } from '../util/logging.js';
import { router } from './routes.js';
import { preloadPrompts } from '../core/prompts.js';

const log = createLogger();
const app = express();
app.use(express.json({ limit: '512kb' }));

// Basic request logging
app.use((req, _res, next) => {
  const start = Date.now();
  (req as unknown as { log: ReturnType<typeof createLogger> }).log = log;
  log.debug({ method: req.method, path: req.path }, 'req:start');
  resOnFinish(_res, () => {
    const ms = Date.now() - start;
    log.debug({ method: req.method, path: req.path, ms }, 'req:done');
  });
  next();
});

function resOnFinish(res: express.Response, cb: () => void) {
  res.on('finish', cb);
  res.on('close', cb);
}

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.use('/', router(log));

const port = Number(process.env.PORT ?? 3000);
preloadPrompts()
  .catch(() => void 0)
  .finally(() => {
    app.listen(port, () => log.info({ port }, 'HTTP server started'));
  });


