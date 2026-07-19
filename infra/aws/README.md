# AWS deployment

This stack deploys the assignment application into `ap-south-1` by default:

- private, encrypted RDS PostgreSQL with a seven-day backup window;
- SQS ingestion and analysis queues with encrypted DLQs;
- one EC2 application host behind an ALB;
- one application image in ECR, run as API, ingestion worker, and analysis worker;
- private S3 static hosting behind CloudFront;
- CloudFront `/api/*` routing to the ALB;
- Secrets Manager for RDS credentials and application-only secrets;
- SSM access without an inbound SSH rule;
- CloudWatch container logs.

The EC2 host is intentionally a single instance for the assignment/demo budget. RDS and
the queues are externalized, so the runtime can later move to an Auto Scaling Group or ECS
without changing application persistence or event contracts.

## Required local values

Authenticate `AWS_PROFILE=SysAdmin`, then set these in `.env`:

- `HIGHLEVEL_CLIENT_ID`
- `HIGHLEVEL_CLIENT_SECRET`
- `HIGHLEVEL_TOKEN_ENCRYPTION_KEY`
- `HIGHLEVEL_APP_SHARED_SECRET` (optional on the first deploy; if absent, the deploy
  generates it in Secrets Manager and prints a retrieval command so the same value can
  be entered in the Marketplace Custom Page settings)
- `LLM_API_KEY` for the production model gateway
- `LLM_PROVIDER=openai-compatible`
- `LLM_BASE_URL`, `LLM_PROVIDER_ID`, and `LLM_MODEL`
- `LLM_MAX_OUTPUT_TOKENS` and `LLM_REQUEST_TIMEOUT_MS` when the defaults are unsuitable

The local `opencode` adapter is deliberately rejected by the deployment script. It relies
on an interactive developer subscription and is not an unattended service credential.
Use `PRODUCTION_LLM_PROVIDER=none` only to smoke-test the infrastructure without semantic
LLM analysis; deterministic processing and the full queue lifecycle still run.

## Deploy

```bash
AWS_PROFILE=SysAdmin \
AWS_REGION=ap-south-1 \
PRODUCTION_LLM_PROVIDER=openai-compatible \
bash infra/aws/deploy.sh
```

After deployment, copy the printed CloudFront URLs into the Marketplace app version:

- OAuth redirect: `https://<distribution>/api/leadconnector/oauth`
- Webhook: `https://<distribution>/api/leadconnector/webhook`
- Custom Page URL: `https://<distribution>/`

The deploy script applies Drizzle migrations and seeds the recommendation catalogue before
starting the API and workers.
