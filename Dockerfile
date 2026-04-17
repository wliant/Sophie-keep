# syntax=docker/dockerfile:1.7

# Multi-stage image: compile once with full toolchain, run on a slim runtime.
# better-sqlite3 and sharp both ship native bindings, so the build stage needs
# a C/C++ toolchain + python to rebuild against the target Node version.

FROM node:20-bookworm AS build
WORKDIR /app

# Install build deps for native modules (better-sqlite3, sharp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/

RUN npm ci

COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/web packages/web

RUN npm run build

# Prune devDependencies so only production modules ship in the runtime image.
RUN npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BIND=0.0.0.0 \
    SOPHIE_DATA_DIR=/data

# libvips is required for sharp; the other native deps run fine against glibc.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libvips \
       tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/photos /data/backups /data/logs \
  && useradd --system --uid 10001 --home /app sophie \
  && chown -R sophie:sophie /app /data

COPY --from=build --chown=sophie:sophie /app/package.json ./package.json
COPY --from=build --chown=sophie:sophie /app/node_modules ./node_modules
COPY --from=build --chown=sophie:sophie /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=sophie:sophie /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=sophie:sophie /app/packages/api/dist packages/api/dist
COPY --from=build --chown=sophie:sophie /app/packages/api/package.json packages/api/package.json
COPY --from=build --chown=sophie:sophie /app/packages/web/dist packages/web/dist
COPY --from=build --chown=sophie:sophie /app/packages/web/package.json packages/web/package.json

USER sophie
VOLUME ["/data"]
EXPOSE 3000

# tini reaps zombies and handles SIGTERM cleanly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/api/dist/index.js"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
