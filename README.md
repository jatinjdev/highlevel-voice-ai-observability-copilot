# Voice AI Observability Copilot

A production-shaped HighLevel Marketplace app that turns Voice AI call logs into
evidence-backed findings and configuration recommendations across prompts, Knowledge Base,
Actions, call settings, transcription, speech, and other documented Voice AI surfaces.

## Workspace layout

```text
apps/
  api/               Marketplace OAuth, webhooks, sessions, outbox, and dashboard API
  ingestion-worker/  Idempotent call normalization and historical-ingestion jobs
  analysis-worker/   Versioned criteria evaluation and linked recommendations
  web/               Vue 3 HighLevel Custom Page
packages/
  contracts/         Versioned runtime-validated HTTP and event contracts
  database/          Shared Drizzle schema and migrations
  messaging/         AWS SQS publisher/consumer primitives
infra/
  localstack/        Local SQS/DLQ bootstrap
docs/architecture/   Architecture overview and decision records
```

## Runtime flow

1. HighLevel installs the app into a Location through Marketplace OAuth.
2. `VoiceAiCallEnd` reaches the API, which verifies the exact request bytes with
   Ed25519 and stores an inbox record plus an outbox message atomically.
3. The outbox publisher sends only identifiers to SQS. Transcripts remain in
   PostgreSQL rather than travelling through queue payloads.
4. The ingestion worker claims the message idempotently, normalizes the call and
   action timestamps, then publishes an analysis request through its own outbox.
5. The analysis worker leases the call, resolves the agent's active Success
   Criteria, and evaluates each criterion independently as pass, fail,
   not-applicable, or unknown. It validates cited transcript turns and creates a
   paste-ready prompt recommendation only for an eligible failed criterion.
6. The Vue Custom Page exchanges HighLevel's encrypted user context for a
   15-minute location-bound session and renders the unified dashboard.

Manual historical sync enters the same durable ingestion path as webhooks; it
does not use a separate analyzer.

## Local setup

Prerequisites: Node.js 22.20+, pnpm 10+, and Docker Desktop.

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

The dashboard runs at <http://localhost:5173>. The API runs at
<http://localhost:3000/api>, with Swagger at <http://localhost:3000/api/docs>.

LocalStack creates the ingestion and analysis queues, their DLQs, visibility
timeouts, and redrive policies. Set `OUTBOX_PUBLISHER_ENABLED=true` to exercise
the SQS path locally. `LLM_PROVIDER=none` needs no model credential. Set
`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_MODEL`, and, when required,
`LLM_API_KEY` to enable semantic evaluation through an OpenAI-compatible endpoint.
The default base URL uses OpenAI; compatible gateways and local servers can be
selected without changing application code. `LLM_MAX_OUTPUT_TOKENS` and
`LLM_REQUEST_TIMEOUT_MS` bound structured evaluation output and request duration.

For a local assignment demo, `LLM_PROVIDER=opencode` can instead connect to a
separately running OpenCode server and use an OAuth-backed ChatGPT Plus/Pro model.
This is a development convenience, not the production Marketplace architecture:
the deployed worker should use a service-owned model credential or managed model
gateway rather than a developer's interactive subscription.

## Useful commands

| Command                                                    | Purpose                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                                 | Run all development processes                                       |
| `pnpm check`                                               | Lint, typecheck, test, and build everything                         |
| `pnpm db:generate`                                         | Generate a migration from the Drizzle schema                        |
| `pnpm db:migrate`                                          | Apply pending database migrations                                   |
| `pnpm db:studio`                                           | Open Drizzle Studio                                                 |
| `pnpm --filter @copilot/api sync:location -- <locationId>` | Queue a convergent historical sync for one OAuth-installed Location |

AWS releases are separated by change type. `infra` changes only CloudFormation,
`backend` builds one immutable image and updates the Docker Compose application,
`frontend` publishes only static assets, and `config <process>` recreates only the
affected container. See [the AWS runbook](infra/aws/README.md) for the exact commands.

## Documentation

- [Architecture and service boundaries](docs/architecture/README.md)
- [HighLevel setup and production-flow runbook](docs/HIGHLEVEL_INTEGRATION_RUNBOOK.md)
- [Implementation status and remaining production work](docs/IMPLEMENTATION_STATUS.md)

## Security boundaries

- Marketplace secrets, PITs, refresh tokens, and model keys are backend-only.
- OAuth tokens are encrypted at rest with AES-256-GCM and rotated on refresh.
- Webhook signatures are verified before any event is accepted.
- Queue messages contain internal identifiers, not transcripts or credentials.
- The public ALB accepts network traffic only from CloudFront's AWS-managed origin
  network.
- Production dashboard authorization comes from signed HighLevel user context;
  a caller-supplied `locationId` is never an authorization boundary.
- Semantic analysis redacts common contact data and excludes raw action
  parameters before sending evidence to the model provider.

The assignment environment uses CloudFront/S3, an ALB-backed EC2 application
host, private RDS PostgreSQL, SQS/DLQs, ECR, Secrets Manager, CloudWatch, and
SSM-only host administration. The single host is a cost-conscious deployment
boundary, not an application coupling: the API and workers have distinct
commands, configuration, health behavior, queues, and resource limits. Remaining
scale and operations work is explicit in `docs/IMPLEMENTATION_STATUS.md`.
