// STEP 3 — Elasticsearch client + connection lifecycle.
//
// Two non-obvious bits worth calling out:
//
// 1. We export a SINGLE shared client. The official client maintains an
//    HTTP keep-alive pool; making a new client per request blows that
//    away and turns every search into a fresh TCP+TLS handshake.
//
// 2. waitForReady() polls cluster health on boot. On Render's free tier,
//    Elasticsearch can take 30+ seconds to become green after a cold
//    start. If the API server boots first and starts serving 503s, the
//    Render edge marks the service unhealthy. Better to block startup
//    until ES says "yellow" (good enough for single-node).
import { Client } from '@elastic/elasticsearch';
import { config } from './config.js';

export const es = new Client({
  node: config.esNode,
  auth: config.esAuth,
  // Elasticsearch 8 servers default to TLS + a self-signed CA. Bonsai/
  // Elastic Cloud terminate TLS with a real cert, so we keep verification
  // on. For local docker-compose we run ES in plaintext on the docker
  // network (xpack.security disabled), so this never fires.
  tls: { rejectUnauthorized: true },
  // Default is 30s. We override to 10s so a stuck call surfaces fast in logs.
  requestTimeout: 10_000,
});

export const waitForReady = async (timeoutMs = 60_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      // `wait_for_status: 'yellow'` accepts a single-node cluster.
      // Demanding 'green' would never resolve because there are no replicas.
      await es.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  throw new Error(
    `Elasticsearch not ready within ${timeoutMs}ms: ${(lastError as Error)?.message}`,
  );
};
