# AWS deployment runbook

The assignment stack runs in `ap-south-1` by default:

- a private, encrypted RDS PostgreSQL database;
- encrypted SQS ingestion and analysis queues with DLQs;
- one SSM-managed EC2 host running the API and two workers as separate containers;
- an ALB whose ingress is restricted to the CloudFront origin-facing prefix list
  and whose listener requires this distribution's generated origin header;
- a private S3 web origin behind CloudFront;
- immutable application images and a separate mutable build-cache repository in ECR;
- Secrets Manager for credentials, SSM Parameter Store for the desired immutable image;
- CloudWatch logs plus API-readiness, queue-age, and DLQ alarms.

The single host keeps the assignment inexpensive. PostgreSQL, queues, contracts,
and process boundaries are externalized so each process can move to an
independently scaled scheduler later without redesigning the application.

## Release interfaces

Every deployment command has one ownership boundary. A frontend or configuration
change does not rebuild the backend, and a backend release does not silently run a
database migration.

```bash
bash infra/aws/deploy.sh infra
bash infra/aws/deploy.sh backend
bash infra/aws/deploy.sh backend-migrate
bash infra/aws/deploy.sh frontend
bash infra/aws/deploy.sh config api
bash infra/aws/deploy.sh config ingestion
bash infra/aws/deploy.sh config analysis
bash infra/aws/deploy.sh config all
bash infra/aws/deploy.sh all
```

All commands use `AWS_PROFILE=SysAdmin`, `AWS_REGION=ap-south-1`, and
`STACK_NAME=voice-ai-observability` unless overridden.

| Command           | Changes                                         | Does not change           |
| ----------------- | ----------------------------------------------- | ------------------------- |
| `infra`           | CloudFormation resources                        | code, configuration, data |
| `backend`         | immutable API/worker image and three containers | schema, frontend          |
| `backend-migrate` | RDS snapshot, drained migration, backend image  | frontend                  |
| `frontend`        | built Vue assets and targeted CloudFront paths  | backend, schema, config   |
| `config <target>` | secret value and selected process environment   | image, schema, frontend   |
| `all`             | checks followed by every required layer         | nothing in the stack      |

`backend` is for schema-compatible releases. Use `backend-migrate` whenever the
release needs a new migration. That mode creates and waits for an RDS snapshot,
stops all processes, runs the migration from the production image, then starts the
API only after database readiness succeeds and starts the workers afterward.

## Required local configuration

Authenticate the AWS profile and place these values in `.env`:

- `HIGHLEVEL_CLIENT_ID`
- `HIGHLEVEL_CLIENT_SECRET`
- `HIGHLEVEL_APP_ID`
- `HIGHLEVEL_TOKEN_ENCRYPTION_KEY`
- `HIGHLEVEL_APP_SHARED_SECRET` (optional initially; an existing stored value is preserved)
- `LLM_PROVIDER=openai-compatible`
- `LLM_BASE_URL`
- `LLM_PROVIDER_ID`
- `LLM_MODEL`
- `LLM_API_KEY`
- optional model request bounds documented in `.env.example`

The renderer reads `.env` as data rather than sourcing it as shell code. The
interactive `opencode` adapter is rejected for production because it is not an
unattended service credential. `LLM_PROVIDER=none` is valid only when explicitly
selected for infrastructure smoke testing.

## Backend release behavior

- Repository checks run before a build unless `SKIP_CHECKS=true` is explicit.
- Dirty-tree publishing is rejected unless `ALLOW_DIRTY_BUILD=true` is explicit.
- The default image tag is the Git commit; ECR tags are immutable.
- The host receives and pulls a repository digest, never a mutable tag.
- BuildKit uses a separate registry cache and publishes provenance and an SBOM.
- Containers run as a non-root user with a read-only filesystem, dropped Linux
  capabilities, `no-new-privileges`, memory limits, and a 60-second stop timeout.
- API replacement succeeds only after `/api/health/ready` can query PostgreSQL.
- A failed schema-compatible replacement restores the prior image across every
  process already changed, avoiding a mixed-version backend.

Configuration is split by process. The API receives HighLevel/session settings,
the ingestion worker receives only its database and queue settings, and the
analysis worker alone receives model-provider settings.

## Frontend caching

Content-hashed assets are published with a one-year immutable cache policy.
HTML and other entry files are published with `no-cache`. The release invalidates
only `/` and `/index.html`, not the full distribution.

## Marketplace endpoints

After the first successful release, configure the Marketplace app with:

- OAuth redirect: `https://<distribution>/api/leadconnector/oauth`
- Webhook: `https://<distribution>/api/leadconnector/webhook`
- Custom Page URL: `https://<distribution>/`

The application host has no inbound SSH rule. Use SSM Session Manager and
CloudWatch logs for runtime diagnosis.
