# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm validates and applies this project patch during both frozen installs.
COPY patches/ ./patches/

FROM dependencies AS production-dependencies
RUN --mount=type=cache,id=strahov-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store

# Administrative importer shares the locked server dependencies, not game assets.
FROM production-dependencies AS rag-tools
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node scripts/rag-import.ts ./scripts/rag-import.ts
COPY --chown=node:node scripts/docker-rag-bootstrap.ts scripts/docker-rag-secrets.mjs ./scripts/
USER node
ENTRYPOINT ["node", "--import", "tsx", "scripts/rag-import.ts"]
CMD ["status"]

FROM dependencies AS build
RUN --mount=type=cache,id=strahov-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
# Catch accidental broad .dockerignore exceptions before authoring archives
# silently become part of the build stage.
RUN test ! -d assets/blender
RUN node scripts/check-runtime-assets.mjs
# The SDK resolves / against the browser origin, including HTTPS and its port.
# The frozen install/cache key above already verifies manifests and patches.
# COPY may refresh identical input mtimes; do not let pnpm 11 reinstall them.
RUN VITE_MULTIPLAYER_URL=/ pnpm --config.verify-deps-before-run=false run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=2567 \
    STATIC_DIR=/app/dist \
    FEEDBACK_DIR=/data/feedback
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts/docker-game-entrypoint.mjs /app/scripts/docker-rag-secrets.mjs ./scripts/
RUN mkdir -p /data/feedback && chown node:node /data/feedback
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "--import", "tsx", "server/index.ts"]
