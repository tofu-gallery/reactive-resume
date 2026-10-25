# syntax=docker/dockerfile:1.7

# Base image only; pnpm self-manages to the `packageManager` version in package.json.
ARG PNPM_VERSION=12.14.0
ARG NODE_VERSION=24
ARG TURBO_VERSION=2.11.9

FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS base

ARG NODE_VERSION
ARG TURBO_VERSION

RUN pnpm runtime set node ${NODE_VERSION} -g --config.store-dir=/pnpm/runtime-store

WORKDIR /app

ENV TURBO_TELEMETRY_DISABLED=1

FROM base AS pruner
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm dlx turbo@${TURBO_VERSION} prune web server --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
# The server build bundles the published agent skills, which live outside any workspace package and so outside the prune.
COPY --from=pruner /app/plugins/reactive-resume/skills ./plugins/reactive-resume/skills
RUN rm -rf apps/web/dist apps/web/dist-prerender apps/server/dist && pnpm turbo run build --filter=web --filter=server --force

FROM base AS runtime-pruner
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm dlx turbo@${TURBO_VERSION} prune server --docker

FROM base AS runtime-deps
COPY --from=runtime-pruner /app/out/json/ ./
COPY --from=runtime-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --prod --frozen-lockfile

FROM node:${NODE_VERSION}-slim AS runtime

ARG APP_REVISION
ENV APP_REVISION=${APP_REVISION}

LABEL maintainer="amruthpillai"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Reactive Resume"
LABEL org.opencontainers.image.description="A free and open-source resume builder."
LABEL org.opencontainers.image.vendor="Amruth Pillai"
LABEL org.opencontainers.image.url="https://rxresu.me"
LABEL org.opencontainers.image.documentation="https://docs.rxresu.me"
LABEL org.opencontainers.image.source="https://github.com/reactive-resume/reactive-resume"

ENV NODE_ENV="production" \
    PORT=3000 \
    LOCAL_STORAGE_PATH=/app/data

WORKDIR /app

RUN mkdir -p /app/apps/server /app/apps/web /app/data && chown node:node /app/data

COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=pruner --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=runtime-deps --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=runtime-deps --chown=node:node /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=node:node /app/apps/web/dist-prerender ./apps/web/dist-prerender
COPY --from=builder --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=pruner --chown=node:node /app/migrations ./migrations
# Tofu (2026-10-25): the image starts through tofu-entrypoint.sh, run with /bin/sh because a file Tofu deploys arrives
# without its execute bit. It derives the secrets, fits DATABASE_URL to the managed database's pooler, keeps uploads in
# PostgreSQL and starts the server as root, since Tofu's PORT is 80. Upstream's docker-entrypoint.sh is not used.
COPY tofu-entrypoint.sh /app/tofu-entrypoint.sh

WORKDIR /app

# Tofu (2026-10-25): no USER line, so the server runs as root and can listen on Tofu's PORT (80 unless the app sets
# another); upstream's entrypoint switched to `node` here.
ENTRYPOINT ["/bin/sh", "/app/tofu-entrypoint.sh"]

EXPOSE 3000/tcp
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/health`).then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "apps/server/dist/index.mjs"]
