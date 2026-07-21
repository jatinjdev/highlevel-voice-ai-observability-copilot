# syntax=docker/dockerfile:1.7

FROM public.ecr.aws/docker/library/node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack install --global pnpm@10.19.0
WORKDIR /app

FROM base AS manifests

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ingestion-worker/package.json apps/ingestion-worker/package.json
COPY apps/analysis-worker/package.json apps/analysis-worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/messaging/package.json packages/messaging/package.json

FROM manifests AS build

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY apps/ingestion-worker apps/ingestion-worker
COPY apps/analysis-worker apps/analysis-worker
COPY packages packages

RUN pnpm --filter @copilot/api... \
  --filter @copilot/ingestion-worker... \
  --filter @copilot/analysis-worker... \
  build

FROM build AS production-dependencies

RUN CI=true pnpm install --prod --offline --frozen-lockfile

FROM public.ecr.aws/docker/library/node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS runtime

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && curl --fail --silent --show-error --proto '=https' \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    --output /etc/ssl/certs/aws-rds-global-bundle.pem \
  && apt-get purge --yes --auto-remove curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/api/node_modules apps/api/node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/ingestion-worker/node_modules apps/ingestion-worker/node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/analysis-worker/node_modules apps/analysis-worker/node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/database/node_modules packages/database/node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/messaging/node_modules packages/messaging/node_modules

COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle apps/api/drizzle
COPY --from=build --chown=node:node /app/apps/api/fixtures apps/api/fixtures
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/apps/ingestion-worker/dist apps/ingestion-worker/dist
COPY --from=build --chown=node:node /app/apps/ingestion-worker/package.json apps/ingestion-worker/package.json
COPY --from=build --chown=node:node /app/apps/analysis-worker/dist apps/analysis-worker/dist
COPY --from=build --chown=node:node /app/apps/analysis-worker/package.json apps/analysis-worker/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/database/dist packages/database/dist
COPY --from=build --chown=node:node /app/packages/database/package.json packages/database/package.json
COPY --from=build --chown=node:node /app/packages/messaging/dist packages/messaging/dist
COPY --from=build --chown=node:node /app/packages/messaging/package.json packages/messaging/package.json

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
