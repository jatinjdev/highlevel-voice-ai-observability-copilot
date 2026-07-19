# Implementation status

This file separates the working assignment slice from production work that should
not be hidden behind a “production-ready” label.

## Implemented and verified

- Three independently deployable NestJS processes: Marketplace API, ingestion
  worker, and analysis worker, plus the Vue Custom Page.
- Company → Location → installation/grant data model, encrypted OAuth tokens,
  refresh-token rotation, install/update/uninstall lifecycle handling, and
  location-scoped access.
- Ed25519 verification of the exact HighLevel webhook request body.
- Transactional webhook inbox and message outbox with leases, retry scheduling,
  SQS routing, DLQs, and at-least-once idempotency at every consumer.
- One canonical call-ingestion path for both realtime webhooks and manual
  historical sync.
- Canonical storage of transcripts, summaries, translations, extracted fields,
  and executed-action timing data.
- Immutable Agent Configuration Snapshots, versioned Success Criteria, and Criterion Sets.
- Source-fact extraction plus a provider-neutral structured-output boundary, a
  configurable OpenAI-compatible adapter, contact-data redaction, prompt-injection
  boundaries, and evidence validation.
- Local/demo OpenCode adapter for subscription-backed evaluation without placing the
  upstream OAuth credential in application configuration.
- Immutable analysis-release records covering evaluator, prompt, schema, catalogue,
  provider, model, and model parameters.
- Evidence-linked, catalogue-constrained, manual-only Recommendations at call and agent scope.
- Signed HighLevel Custom Page context exchanged for a short-lived, opaque,
  location-bound application session.
- Dashboard, Agent Analysis, and call forensic APIs plus the Vue Custom Page.
- Durable, coalescing per-agent aggregation jobs so call completion does not synchronously
  rebuild an agent cohort.
- Durable 24-hour/7-day reanalysis batches with per-call status and a status endpoint.
- A pure CallAnalyzer and pure AgentCohortAnalyzer shared by production and evaluation tests.
- Harper Valley and Theobroma scenario packs; Theobroma now includes call- and agent-level
  ground truth for outcome, flagged criteria, and recommendation targets.
- Local PostgreSQL and LocalStack composition with two SQS queues, two DLQs,
  visibility timeouts, and redrive policies.
- Deployable AWS CloudFormation for CloudFront/S3, ALB plus an SSM-only EC2 host,
  private encrypted RDS PostgreSQL, SQS/DLQs, ECR, Secrets Manager, CloudWatch
  Logs, VPC networking, and least-privilege instance IAM.
- A production deployment at `https://dng3naypayh7.cloudfront.net`, with all 16
  migrations applied, the recommendation catalogue seeded, three application
  processes running, and a healthy ALB target.
- Repository-wide lint, typecheck, unit tests, and builds pass with `pnpm check`.

## Intentionally incomplete

These are the next production increments, not silent TODOs inside the main path:

The existing dashboard and v1 evaluation model are now explicitly superseded by
[`ANALYTICS_AND_DASHBOARD_DESIGN.md`](./ANALYTICS_AND_DASHBOARD_DESIGN.md). The current
single-score projection remains a working vertical slice, not the target analytics
product.

1. **Backfill orchestration:** lifecycle events create durable backfill jobs and
   manual sync feeds the canonical path, but a scheduled worker still needs to
   paginate those jobs automatically and maintain per-location watermarks.
2. **Reconciliation:** periodically compare recent HighLevel call logs with local
   calls so a missed webhook cannot create a permanent gap.
3. **Agent recommendation synthesis:** recurring targets are deterministically grouped,
   but their aggregate wording still reuses the first call's paste-ready change. Add a
   constrained agent-level synthesis/eval step that writes one change supported by all
   linked calls.
4. **Evaluation calibration:** run the annotated Theobroma and Harper Valley suites with
   the chosen model, manually adjudicate mismatches, record regression tolerances, and
   report judge/human agreement before making evals a release gate.
5. **Pagination and projections:** cursor-paginate agent calls and large evidence lists;
   introduce read projections only after measured query volume requires them.
6. **Horizontal runtime scaling:** the assignment deployment deliberately uses one
   `t3.small` Docker host. Split the three processes into independently scalable
   ECS/Fargate services (or an equivalent scheduler) and add autoscaling before
   treating it as a multi-customer production fleet.
7. **Operations and privacy:** structured telemetry, queue-age/error/SLO alarms,
   DLQ replay tooling, transcript retention/deletion jobs, audit events, and a
   documented incident/runbook policy.
8. **OAuth model consolidation:** lifecycle hierarchy and legacy encrypted-token
   storage coexist for compatibility. Move credentials behind the normalized
   installation/grant model and add multi-location agency-install reconciliation.

## Local verification state

`pnpm check` succeeds. Database migrations have been generated through
`apps/api/drizzle/0015_condemned_black_widow.sql`, and all migrations are applied to the
configured local PostgreSQL database.

## AWS verification state

The `voice-ai-observability` stack is deployed in `ap-south-1`. RDS is private,
encrypted, backed up for seven days, and accessed with TLS certificate validation.
The API and both workers load runtime configuration from Secrets Manager and use
the live SQS queues. `LLM_PROVIDER=none` is intentional until a service-owned model
API credential is supplied, so infrastructure and deterministic analysis work but
semantic LLM analysis is not yet enabled in AWS.

## Demo completion gate

Before recording the assignment demo, require all of the following:

- install into the sandbox Location using the Marketplace test link;
- complete signed Custom Page session exchange without a development fallback;
- create at least two agents and a balanced set of successful and failed calls;
- observe one new call traverse inbox → SQS → ingestion → analysis → dashboard;
- rerun/replay delivery and demonstrate no duplicate call or analysis;
- show exact transcript evidence and a paste-ready manual Recommendation;
- run a historical sync twice and demonstrate convergence;
- run `pnpm check` from a clean checkout and manually review the submitted diff.
