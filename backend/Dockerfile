# syntax=docker/dockerfile:1

FROM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/trurpchat.db \
    ICE_CONFIG_FILE=/app/backend/ice.json

RUN mkdir -p /data && chown bun:bun /data

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun backend ./backend
COPY --chown=bun:bun shared ./shared

USER bun

VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "backend/index.ts"]
