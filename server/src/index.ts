// STEP 7 — Express bootstrap. Wires routes, CORS, healthchecks, and the
// Elasticsearch readiness gate together.
//
// Lifecycle on startup:
//   1. Create Express app + middleware (synchronous, fast).
//   2. Open the HTTP listener so /healthz responds even if ES is slow.
//      (Render checks /healthz to decide if a deploy succeeded — a 60s
//       ES bootstrap would otherwise look like a deploy failure.)
//   3. Block on waitForReady() in the background. While it's running,
//      /readyz returns 503; once it resolves, /readyz returns 200.
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { es, waitForReady } from './es.js';
import { searchRouter } from './routes/search.js';

const app = express();

// CORS: in dev we allow everything; in prod we lock to the configured
// origins (typically the Vercel URL). The empty-array branch falls
// through to `cors()` defaults which permit any origin.
app.use(
  cors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  }),
);
app.use(express.json());

// /healthz is the Render liveness probe — answer 200 as soon as the
// process has bound to the port.
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// /readyz is the readiness probe — answers 200 only when ES is up. We
// track the boot state in a closure variable so this lookup is O(1).
let esReady = false;
app.get('/readyz', async (_req, res) => {
  if (!esReady) {
    res.status(503).json({ status: 'pending', reason: 'elasticsearch not ready' });
    return;
  }
  // Verify the connection didn't drop AFTER bootstrap by pinging once.
  try {
    await es.ping();
    res.json({ status: 'ok', elasticsearch: true });
  } catch {
    res.status(503).json({ status: 'degraded', elasticsearch: false });
  }
});

app.use('/api', searchRouter);

// Default error handler — funnels async route errors into a uniform JSON
// response so the React client can rely on `{ error: '...' }` shape.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
  console.log(`Elasticsearch target: ${config.esNode}`);
});

// Wait for ES in the background — DON'T block the listen() call.
waitForReady()
  .then(() => {
    esReady = true;
    console.log('Elasticsearch ready');
  })
  .catch((err) => {
    console.error('Elasticsearch never came up:', err.message);
    // Don't kill the process — operator can restart ES, /readyz will flip.
  });

// Graceful shutdown so Render can replace the container without
// dropping in-flight requests on a redeploy.
const shutdown = (signal: string): void => {
  console.log(`Received ${signal}, closing server`);
  server.close(() => {
    void es.close().then(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
