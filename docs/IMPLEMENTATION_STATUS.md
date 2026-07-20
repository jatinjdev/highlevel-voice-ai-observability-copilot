# Implementation status

This file distinguishes the working assignment system from work that would still
be required before operating a large multi-customer fleet.

## Implemented

- Separately runnable Marketplace API, ingestion worker, analysis worker, and Vue
  Custom Page.
- Company → Location → Marketplace installation/grant hierarchy, encrypted OAuth
  tokens, refresh rotation, and install/update/uninstall lifecycle handling.
- Exact-body Ed25519 webhook verification and location-scoped dashboard sessions.
- Transactional webhook inbox and outbox, leased publishing, SQS/DLQs, retry
  scheduling, and idempotent consumers.
- One canonical ingestion path for live webhooks, historical sync, and reanalysis.
- Current Voice Agent configuration plus agent-owned Success Criteria with immutable,
  unique names and editable descriptions.
- A deliberately small call-analysis loop: load transcript/action evidence and current
  criterion descriptions, make one structured model request, validate cited evidence,
  and persist the categorical checklist results.
- Manual agent-level Prompt Recommendation generation for one failed criterion at a
  time, using at most the 20 most recent failures and the current prompt. Calls never
  produce recommendations.
- Call- and agent-level UI that traces failed criteria back to exact Call evidence.
- Durable 24-hour and seven-day reanalysis batches.
- One intentionally incomplete Theobroma prompt-remediation scenario pack that enters
  through the production ingestion and analysis path.
- Local PostgreSQL and LocalStack composition.
- AWS CloudFormation for CloudFront/S3, CloudFront-restricted ALB ingress, an
  SSM-only EC2 host, private encrypted RDS, SQS/DLQs, ECR, Secrets Manager,
  CloudWatch logs and operational alarms.
- Change-scoped releases, immutable commit-tagged images, ordinary Docker layer
  caching, Docker Compose runtime management, per-process configuration,
  readiness checks, and graceful container replacement.
- Pull-request CI for formatting, lint, typecheck, tests, build, and the production
  container image.

Database migrations currently run through
`apps/api/drizzle/0019_simplified_analysis_model.sql`.
Migration `0019` is the explicit one-time breaking reset authorized for this assessment refactor:
it clears legacy analysis/checklist state so calls can be re-evaluated under the simpler model. It
must not be treated as a reusable zero-downtime production upgrade; back up any environment whose
legacy evaluation state must be retained before applying it.

## Known production increments

1. **Backfill scheduling:** automatically paginate lifecycle-created jobs and
   maintain a per-location watermark.
2. **Reconciliation:** periodically compare recent HighLevel logs with local calls
   so a missed webhook cannot create a permanent gap.
3. **Evaluation calibration:** adjudicate the scenario suites with the selected
   production model and gate evaluator changes on recorded regressions.
4. **Large-list pagination:** cursor-paginate call and evidence APIs before storing
   production-scale history.
5. **Independent compute scaling:** replace the single assignment host with ECS,
   another scheduler, or an Auto Scaling Group when measured traffic requires it.
   The existing API and workers are already separate runtime processes.
6. **Zero-downtime schema evolution:** enforce expand/migrate/contract changes and
   add automated rollback or forward-recovery runbooks for migration releases.
7. **Privacy operations:** transcript retention/deletion, audit events, key rotation,
   and a documented incident procedure.
8. **DLQ operations:** authenticated replay tooling and alarm response runbooks.
9. **OAuth consolidation:** move legacy credential compatibility fully behind the
   normalized installation/grant model.

## Verification boundary

Local verification requires `pnpm format:check`, `pnpm check`, a production-image
build, and a runtime migration against disposable PostgreSQL. AWS verification
requires valid SSO credentials and is intentionally separate from local code
validation. This branch does not claim that CloudFormation or runtime changes are
deployed until those commands complete against the account.

## Demo completion gate

- install the Marketplace app into the sandbox Location;
- exchange signed Custom Page context without a development fallback;
- observe a new call traverse inbox → SQS → ingestion → analysis → dashboard;
- redeliver/requeue it and demonstrate idempotency;
- show criterion result and exact transcript evidence, then manually generate a
  paste-ready agent recommendation for that criterion;
- run historical sync twice and demonstrate convergence;
- show queue/readiness alarms and the migration release boundary;
- run repository checks from a clean checkout and manually review the submitted diff.
