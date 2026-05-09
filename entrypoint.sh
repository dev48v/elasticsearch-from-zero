#!/usr/bin/env bash
# Entrypoint — co-runs Elasticsearch + the Node API.
#
# We don't use supervisord because it's an extra dependency for a
# 30-line shell script that does the job. The pattern:
#   1. Boot ES in the background.
#   2. Poll its health endpoint until it's up.
#   3. Run the indexer ONCE if the index doesn't exist yet (free-tier
#      disks are ephemeral on Render — every redeploy starts blank).
#   4. Exec the API in the foreground so its PID becomes PID 1, which
#      means SIGTERM from Render reaches it directly for graceful
#      shutdown.
set -euo pipefail

ES_PIDFILE=/tmp/es.pid

start_elasticsearch() {
  echo "[entrypoint] Starting Elasticsearch in background..."
  /usr/local/bin/docker-entrypoint.sh elasticsearch &
  echo $! > "$ES_PIDFILE"
}

wait_for_elasticsearch() {
  echo "[entrypoint] Waiting for Elasticsearch on http://localhost:9200..."
  local deadline=$((SECONDS + 180))
  while (( SECONDS < deadline )); do
    if curl -sf "http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null 2>&1; then
      echo "[entrypoint] Elasticsearch is up."
      return 0
    fi
    sleep 2
  done
  echo "[entrypoint] Elasticsearch never became ready in 180s — exiting."
  exit 1
}

ensure_index_seeded() {
  if curl -sf "http://localhost:9200/${RECIPE_INDEX:-recipes}" >/dev/null 2>&1; then
    echo "[entrypoint] Index already exists — skipping seed."
    return
  fi
  echo "[entrypoint] Index missing — running indexer."
  cd /app/server && node dist/scripts/index-recipes.js
}

main() {
  start_elasticsearch
  wait_for_elasticsearch
  ensure_index_seeded
  echo "[entrypoint] Starting Node API on port ${PORT:-8080}..."
  cd /app/server && exec node dist/index.js
}

# Trap to ensure ES dies if the API does — otherwise Render restarts the
# container while ES holds the data dir lock and the next boot fails.
trap 'kill "$(cat "$ES_PIDFILE")" 2>/dev/null || true' EXIT INT TERM

main "$@"
