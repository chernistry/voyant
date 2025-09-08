import 'dotenv/config';
import express from 'express';
import { createLogger } from '../util/logging.js';
import { router } from './routes.js';
import { preloadPrompts } from '../core/prompts.js';
import { RateLimiter } from '../core/rate-limiter.js';
import { RATE_LIMITER_CONFIG } from '../config/resilience.js';

const log = createLogger();
const app = express();

// Rate limiter for API endpoints
const apiRateLimiter = new RateLimiter(RATE_LIMITER_CONFIG);

app.use(express.json({ limit: '512kb' }));

// CORS support for frontend integration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Rate limiting middleware (skip for health checks and OPTIONS)
app.use(async (req, res, next) => {
  if (req.path === '/healthz' || req.method === 'OPTIONS') {
    return next();
  }
  
  if (!(await apiRateLimiter.acquire())) {
    log.warn({ method: req.method, path: req.path, ip: req.ip }, 'Rate limit exceeded');
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.'
    });
  }
  
  // Auto-release after request completes
  resOnFinish(res, () => {
    apiRateLimiter.release();
  });
  
  next();
});

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


