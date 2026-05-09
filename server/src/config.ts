// STEP 2 — Centralised env reading.
// Why one file? Three reasons:
//   1. Validation in one place — fail fast on boot if something is missing.
//   2. Production-vs-local switching — Bonsai/Elastic Cloud paste a URL with
//      user:pass embedded; local docker-compose hands us http://elasticsearch:9200.
//      Both flow through the same parser.
//   3. Tests can stub this module instead of hammering process.env.

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

// ELASTICSEARCH_URL accepts either:
//   http://elasticsearch:9200                      (local docker)
//   https://user:pass@hostname.bonsaisearch.net    (Bonsai sandbox)
// We strip basic-auth out of the URL because the @elastic client takes it
// in a separate `auth: { username, password }` field — leaving credentials
// inline in the `node` URL is silently ignored on https.
const rawEsUrl = required('ELASTICSEARCH_URL', 'http://localhost:9200');
const parsed = new URL(rawEsUrl);
const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
parsed.username = '';
parsed.password = '';

export const config = {
  port: Number(process.env.PORT ?? 8080),
  esNode: parsed.toString().replace(/\/$/, ''),
  esAuth: username && password ? { username, password } : undefined,
  indexName: process.env.RECIPE_INDEX ?? 'recipes',
  themealdbBase: process.env.THEMEALDB_BASE ?? 'https://www.themealdb.com/api/json/v1/1',
  // CORS: comma-separated list. Empty = allow any origin (dev convenience).
  // In production you'd hard-code this to your Vercel URL.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
