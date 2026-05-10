#!/usr/bin/env bash
# Entrypoint — co-runs Elasticsearch + Node API.
#
# Boot sequence:
#   1. Launch ES in background.
#   2. Launch a background watcher that waits for ES, then seeds the
#      index if it's missing. Render's free disk is ephemeral, so every
#      cold start needs the seed.
#   3. Exec the API in the foreground — PID 1 so SIGTERM reaches it.
#
# Why no `wait_for_elasticsearch` blocking the API anymore: Render's
# port-scan health probe times out after 10 min if nothing binds the
# port. On free tier ES can take 90–180s to flip to yellow, so we let
# the API bind immediately and serve /healthz while ES finishes warming
# up in the background. /readyz reflects ES state for callers that care.
set -uo pipefail

ES_PIDFILE=/tmp/es.pid

start_elasticsearch() {
  echo "[entrypoint] Starting Elasticsearch in background..."
  /usr/local/bin/docker-entrypoint.sh elasticsearch &
  echo $! > "$ES_PIDFILE"
}

seed_index_when_ready() {
  echo "[entrypoint:seed] Waiting for Elasticsearch..."
  local deadline=$((SECONDS + 600))
  while (( SECONDS < deadline )); do
    if curl -sf "http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null 2>&1; then
      echo "[entrypoint:seed] Elasticsearch is up."
      break
    fi
    sleep 3
  done
  if (( SECONDS >= deadline )); then
    echo "[entrypoint:seed] Elasticsearch never became ready in 600s — skipping seed."
    return
  fi
  if curl -sf "http://localhost:9200/${RECIPE_INDEX:-recipes}" >/dev/null 2>&1; then
    echo "[entrypoint:seed] Index exists — skipping seed."
    return
  fi
  echo "[entrypoint:seed] Index missing — running indexer."
  cd /app/server && node dist/scripts/index-recipes.js || echo "[entrypoint:seed] Indexer failed (will retry on next deploy)."
}

main() {
  start_elasticsearch
  seed_index_when_ready &
  echo "[entrypoint] Starting Node API on port ${PORT:-8080}..."
  cd /app/server && exec node dist/index.js
}

trap 'kill "$(cat "$ES_PIDFILE" 2>/dev/null)" 2>/dev/null || true' EXIT INT TERM

main "$@"
