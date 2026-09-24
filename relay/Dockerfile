# Sideline relay — provider-neutral production image.
#
# Build from the REPOSITORY ROOT (the relay compiles two shared files from src/control-plane):
#   docker build -f relay/Dockerfile -t sideline-relay .
#
# Runtime configuration comes only from environment variables at `docker run` / deploy time:
#   PORT (default 8080), RELAY_DOMAIN, ENROLLMENT_KEY  (+ optional Stage 4A controls: TRUST_PROXY,
#   BIND_HOST, DRAIN_MS, RATE_HANDSHAKE_PER_MIN, RATE_INVALID_BEFORE_BAN, BAN_MINUTES,
#   RATE_HTTP_PER_MIN, RATE_PAIRING_PER_MIN). No secret is ever baked into this image.

# ---- build: compile the relay entrypoint with TypeScript ----------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY relay ./relay
COPY src/control-plane/relay-frames.ts src/control-plane/host-identity.ts ./src/control-plane/
RUN npx tsc -p relay

# ---- runtime: compiled JS + production dependencies only ------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/out/relay-build ./out/relay-build
USER node
EXPOSE 8080
# Same /health contract the relay implements (Stage 4A); no second health implementation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# SIGTERM (default stop signal) triggers the relay's bounded graceful drain (<= 5 s).
STOPSIGNAL SIGTERM
CMD ["node", "out/relay-build/relay/index.js"]
