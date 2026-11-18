# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae AS build
WORKDIR /src
# The pinned slim base ships Node's public roots without a system CA bundle.
RUN --mount=type=secret,id=apt_ca_bundle,mode=0444 \
    set -eu; \
    sed -i 's|^URIs: http://deb\.debian\.org/|URIs: https://deb.debian.org/|' /etc/apt/sources.list.d/debian.sources; \
    ca_bundle=/run/secrets/apt_ca_bundle; \
    if [ ! -f "$ca_bundle" ]; then \
        ca_bundle=/etc/ssl/certs/ca-certificates.crt; \
        if [ ! -s "$ca_bundle" ]; then \
            ca_bundle="$(mktemp)"; \
            trap 'rm -f "$ca_bundle"' EXIT; \
            node -p 'require("node:tls").getCACertificates("bundled").join("\n")' > "$ca_bundle"; \
            chmod 0444 "$ca_bundle"; \
        fi; \
    fi; \
    apt-get -o "Acquire::https::CAInfo=$ca_bundle" update \
    && apt-get -o "Acquire::https::CAInfo=$ca_bundle" install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*
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
LABEL org.opencontainers.image.title="FileHub" org.opencontainers.image.version="0.42.4"
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
