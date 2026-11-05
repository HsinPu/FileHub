# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.16.0 --allow-scripts=pnpm --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile
COPY apps/server/tsconfig*.json ./apps/server/
COPY apps/server/src ./apps/server/src
COPY apps/server/native ./apps/server/native
COPY scripts/build-native.mjs ./scripts/
COPY apps/server/drizzle ./apps/server/drizzle
COPY apps/web/tsconfig*.json ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/index.html apps/web/vite.config.ts ./apps/web/
COPY apps/web/public ./apps/web/public
COPY THIRD_PARTY_NOTICES.md ./
COPY packages/contracts/tsconfig*.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
RUN pnpm build \
    && pnpm --filter @filehub/server deploy --prod --legacy --frozen-lockfile /out/server

FROM node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae AS runtime
LABEL org.opencontainers.image.title="FileHub" org.opencontainers.image.version="0.40.18"
ENV NODE_ENV=production FILEHUB_STATE_DIR=/data/state
WORKDIR /app
COPY --from=build /out/server/ ./apps/server/
COPY --from=build /src/apps/web/build/ ./apps/web/build/
RUN mkdir -p /data/state /data/files /data/cache /data/backups /run/filehub \
    && chown 1000:1000 /data/state /data/files /data/cache /data/backups /run/filehub
USER 1000:1000
EXPOSE 3000
STOPSIGNAL SIGTERM
ENTRYPOINT ["node"]
CMD ["apps/server/dist/server.js"]
