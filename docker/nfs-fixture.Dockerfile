# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG FILEHUB_CI_IMAGE=filehub-ci:0.40.18
FROM node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae AS unfs
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev make git ca-certificates autoconf automake flex bison libtirpc-dev pkg-config && rm -rf /var/lib/apt/lists/*
RUN git init /opt/unfs-source && git -C /opt/unfs-source remote add origin https://github.com/unfs3/unfs3.git && git -C /opt/unfs-source fetch --depth=1 origin ec1660ba33c80d5c67131e163e68834c1a10e243 && git -C /opt/unfs-source checkout --detach FETCH_HEAD && test "$(git -C /opt/unfs-source rev-parse HEAD)" = ec1660ba33c80d5c67131e163e68834c1a10e243 && cd /opt/unfs-source && ./bootstrap && ./configure --prefix=/opt/unfs && make -j2 && make install
FROM ${FILEHUB_CI_IMAGE}
ARG FILEHUB_VERSION
ARG FILEHUB_CI_ID
LABEL org.filehub.fixture="nfs3" org.filehub.fixture.version="${FILEHUB_VERSION}" org.filehub.fixture.source="${FILEHUB_CI_ID}" org.filehub.fixture.unfs-commit="ec1660ba33c80d5c67131e163e68834c1a10e243"
USER 0:0
RUN apt-get update && apt-get install -y --no-install-recommends nfs-common netbase libtirpc3 && rm -rf /var/lib/apt/lists/*
COPY --from=unfs /opt/unfs /opt/unfs
COPY --from=unfs /opt/unfs-source /opt/unfs-source
RUN mkdir -p /mnt/nfs /fixture /export && chown 1000:1000 /fixture && printf '/export (ro,root_squash)\n' > /etc/unfs-exports
USER 1000:1000
RUN pnpm build
USER 0:0
CMD ["node", "tests/system/fixtures/nfs-client.mjs"]
