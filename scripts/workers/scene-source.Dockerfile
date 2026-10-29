# Build context MUST be scripts/workers, protected by its allowlist .dockerignore.
# Supply an official Node 24 digest through NODE_IMAGE for a reproducible base.
ARG NODE_IMAGE=docker.io/library/node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f
FROM ${NODE_IMAGE}
WORKDIR /worker
ENV NODE_ENV=production TMPDIR=/tmp LANG=C
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY scene-source.mjs ./
USER 65532:65532
ENTRYPOINT ["node", "--max-old-space-size=160", "--permission", "--allow-fs-read=/worker", "--allow-fs-write=/tmp", "--allow-addons", "/worker/scene-source.mjs"]
