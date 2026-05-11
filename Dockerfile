FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Build
RUN bun build src/server/index.ts --target=bun --outfile=dist/server.js

# ── Runtime image ──────────────────────────────────────────────
FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=base /app/dist/server.js ./server.js

# Data volume — mount a persistent volume here in production
VOLUME /data
ENV CUS_DATA_DIR=/data

EXPOSE 3017

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3017/health/ready || exit 1

CMD ["bun", "run", "server.js"]
