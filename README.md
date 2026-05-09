# Elasticsearch From Zero — Recipe Search Engine

Day 30 of TechFromZero. A real recipe search engine built on **Elasticsearch 8** indexing **TheMealDB**, with a Vite + React frontend.

Full-text search, fuzzy matching, autocomplete, faceted filters, and highlights — every Elasticsearch feature you'd actually use in production, demoed against real recipe data.

---

## Quick start

You need Docker. That's it.

```bash
git clone https://github.com/dev48v/elasticsearch-from-zero
cd elasticsearch-from-zero

# 1. Start Elasticsearch + the API
docker compose up -d

# 2. Wait ~30 seconds for ES to come up, then index ~300 recipes from TheMealDB
docker compose run --rm api npm run index

# 3. Run the React client (separate terminal)
npm install --workspace=client
npm run dev:client
# open http://localhost:5173
```

The API listens on `http://localhost:8080` (proxied from the React app via Vite, so the browser only ever talks to `localhost:5173`).

---

## What's in here

```
elasticsearch-from-zero/
├── server/                 Node 22 + TypeScript + Express + @elastic/elasticsearch
│   └── src/
│       ├── config.ts        env loading + ES URL parsing (Bonsai/Elastic Cloud aware)
│       ├── es.ts            shared ES client + cluster-health gate
│       ├── mapping.ts       index mapping (multi-fields, search_as_you_type)
│       ├── themealdb.ts     TheMealDB upstream client + ingredient flattener
│       ├── routes/search.ts five endpoints (search, suggest, recipe, random, facets)
│       ├── scripts/index-recipes.ts   bulk indexer, run via `npm run index`
│       └── index.ts         Express bootstrap + healthchecks + graceful shutdown
├── client/                 Vite + React 19 + react-router-dom 7
│   └── src/
│       ├── pages/Home.tsx   search box + facet sidebar + results grid
│       ├── pages/Detail.tsx full recipe page (ingredients, steps, video)
│       ├── components/SearchBar.tsx   debounced autocomplete dropdown
│       ├── components/RecipeCard.tsx  highlighted match snippets
│       └── api.ts           typed fetch wrapper with AbortController
├── Dockerfile              production: ES + Node together (Render free-tier compatible)
├── docker-compose.yml      local dev: separate ES + API containers
├── entrypoint.sh           production startup (boots ES, waits, seeds, exec API)
└── render.yaml             Render Blueprint
```

---

## Step-by-step build

Each commit on `main` is one self-contained concept. Read them in order:

1. **Monorepo skeleton** — root `package.json` workspaces, `.gitignore`
2. **Server scaffold** — Express + TypeScript, `/healthz`
3. **Elasticsearch client** — shared `Client` instance, cluster-health gate
4. **Index mapping** — multi-fields (`text` / `keyword` / `search_as_you_type`)
5. **TheMealDB ingest + bulk indexer** — pull 300 recipes, batch into ES
6. **Search routes** — `multi_match` + filter + highlight + aggregations
7. **Express bootstrap** — `/healthz`, `/readyz`, graceful shutdown, async ES warm-up
8. **Vite + React client** — router, typed fetch wrapper, env-driven base URL
9. **Search UI** — debounced autocomplete, facet sidebar, URL-synced state
10. **Recipe detail page** — ingredients, instructions, embedded YouTube
11. **Production Dockerfile + render.yaml** — co-located ES + Node container
12. **README** — this file

---

## API reference

| Endpoint | What it does |
|----------|--------------|
| `GET /api/search?q=&category=&area=&size=&from=` | Full-text search across name/ingredients/instructions/category/area with field boosts, fuzzy matching, highlights, and category/area aggregations. |
| `GET /api/suggest?q=` | Up to 8 autocomplete hits via `search_as_you_type` + `bool_prefix`. |
| `GET /api/recipe/:id` | Single recipe by document id. |
| `GET /api/random` | One random recipe via `function_score` + `random_score`. |
| `GET /api/facets` | Aggregation-only call: returns full category + area lists for the dropdowns. |
| `GET /healthz` | Liveness — returns 200 as soon as the process is bound to its port. |
| `GET /readyz` | Readiness — returns 200 only when the ES connection is live. |

---

## Deployment notes

**Frontend** → Vercel. `VITE_API_URL` env var points at the Render backend.

**Backend** → Render free-tier Docker. The single image (`Dockerfile`) co-locates Elasticsearch and Node so the live demo is self-contained. `entrypoint.sh` boots ES in the background, waits for `_cluster/health`, seeds the index on first run, then execs the API.

The free tier is 512 MB RAM. ES is configured with `-Xms200m -Xmx200m` to fit. Indexing happens on first cold-start, so the very first request after a redeploy can take 30–60 seconds while ~300 recipes flow in from TheMealDB.

For a real production deployment you'd run ES separately (Bonsai sandbox, Elastic Cloud, or a managed ES cluster) and point `ELASTICSEARCH_URL` at it. The `config.ts` URL parser already handles the `https://user:pass@host` Bonsai format.

---

## Why these choices

- **`search_as_you_type` for autocomplete** instead of the older completion suggester. The completion suggester needs a separate `_suggest` endpoint and a different query DSL; `search_as_you_type` integrates with `multi_match` so the same query DSL handles both prefix and full-text.
- **`best_fields` over `cross_fields`** for `multi_match`. `best_fields` ranks "the single field that matched best" — closer to how a human grades relevance ("this recipe is literally called 'Chicken Curry'" beats "this recipe mentions chicken in step 4").
- **Highlights via `unified` highlighter** — the modern default that works for any field type. The 2014-era `plain` highlighter is faster but doesn't support `search_as_you_type`.
- **Aggregations on `category.keyword` not `category`** — aggs only work on doc_values, which the analyzed `text` field doesn't store. The keyword sub-field is what you ALWAYS aggregate on.
- **`number_of_replicas: 0`** — single-node clusters can never go green with replicas (no other node to host them). Setting this explicitly avoids a perpetually-yellow cluster.

---

## What you'll learn reading this

- How Elasticsearch's analysis pipeline turns text into searchable tokens
- Why multi-fields (`text` + `keyword` + `search_as_you_type`) exist
- The difference between `must`, `should`, and `filter` in a `bool` query
- How aggregations compose with queries to power faceted search
- Bulk-indexing patterns and concurrency control against external APIs
- Container co-location patterns for free-tier hosts that don't offer managed ES
