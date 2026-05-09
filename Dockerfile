# STEP 11 — Production image. Single Render-compatible container that
# runs BOTH Elasticsearch AND the Node API together.
#
# Why combined? Render's free tier (512 MB RAM, 0.1 CPU) gives us ONE
# Docker service. There's no managed Elasticsearch on the free tier and
# Bonsai/Elastic Cloud requires manual signup. Co-locating ES + Node in
# a single container is a known compromise — production-grade deploys
# would split them, but for a learning project this keeps the live demo
# self-contained.
#
# Layout:
#   Stage 1 (server-build): compile TS → JS into /app/server/dist
#   Stage 2 (runtime):      base on the official ES image (which already
#                           has Java 17 + ES configured), then layer
#                           Node 22 on top, then start both processes
#                           via /entrypoint.sh.
#
# Memory budget on Render free tier:
#   ES JVM heap         200 MB  (Xms200m Xmx200m)
#   ES off-heap          70 MB  (estimated from light single-node use)
#   Node runtime         60 MB
#   OS + container      ~80 MB
#   ────────────────────────────
#   total              ~410 MB  (under 512 MB ceiling)

# ---------- Stage 1: build the Node server ----------
FROM node:22-alpine AS server-build
WORKDIR /app
COPY package.json ./
COPY server/package.json ./server/
RUN npm install --workspace=server --include=dev
COPY server ./server
RUN npm run build --workspace=server \
  && npm prune --workspace=server --omit=dev

# ---------- Stage 2: runtime ----------
FROM docker.elastic.co/elasticsearch/elasticsearch:8.13.4

USER root

# Install Node 22 alongside Java. The base image is RHEL UBI9 — yum is
# available, but rather than pulling Node from the OS repos (which lag
# years behind) we install via the NodeSource binary tarball.
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - \
  && yum install -y nodejs \
  && yum clean all \
  && rm -rf /var/cache/yum

# Drop in the compiled server.
WORKDIR /app
COPY --from=server-build /app/server/package.json /app/server/package.json
COPY --from=server-build /app/server/dist /app/server/dist
COPY --from=server-build /app/server/node_modules /app/server/node_modules
COPY --from=server-build /app/node_modules /app/node_modules
COPY package.json /app/package.json

# Entrypoint script that boots ES in the background, waits for it, then
# either runs the indexer (one-shot) or starts the API in the foreground.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && chown -R elasticsearch:root /app

# Render injects PORT env. ES talks on 9200 internally; we never expose
# it externally — only the Node API does on $PORT.
ENV PORT=8080 \
    ELASTICSEARCH_URL=http://localhost:9200 \
    ES_JAVA_OPTS="-Xms200m -Xmx200m" \
    discovery.type=single-node \
    xpack.security.enabled=false \
    cluster.name=efz \
    bootstrap.memory_lock=false

USER elasticsearch
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
