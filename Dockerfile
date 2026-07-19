FROM public.ecr.aws/docker/library/node:22.20.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM public.ecr.aws/docker/library/node:22.20.0-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem

RUN corepack enable \
  && apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && curl --fail --silent --show-error --proto '=https' \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    --output /etc/ssl/certs/aws-rds-global-bundle.pem \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000
CMD ["pnpm", "--filter", "@copilot/api", "start"]
