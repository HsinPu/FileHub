# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.16.0 --allow-scripts=pnpm --no-audit --no-fund \
    && mkdir -p /workspace && chown 1000:1000 /workspace
WORKDIR /workspace
COPY --chown=1000:1000 package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=1000:1000 apps/server/package.json ./apps/server/
COPY --chown=1000:1000 apps/web/package.json ./apps/web/
COPY --chown=1000:1000 packages/contracts/package.json ./packages/contracts/
USER 1000:1000
RUN pnpm install --frozen-lockfile
COPY --chown=1000:1000 scripts/playwright.mjs ./scripts/
USER 0:0
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/filehub-browsers CI=true
RUN node scripts/playwright.mjs install --with-deps chromium
COPY --chown=1000:1000 . .
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 1000:1000
CMD ["pnpm", "verify:core"]
