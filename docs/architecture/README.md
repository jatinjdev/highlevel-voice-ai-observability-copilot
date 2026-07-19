# Architecture

This directory records decisions that materially affect correctness, scale, or the
HighLevel installation lifecycle. The records are intentionally short: a reviewer
should be able to understand why a boundary exists without reverse-engineering it
from framework code.

## System boundary

The production system has three independently deployable NestJS processes and one
static Vue application:

1. `marketplace-api` owns OAuth, HighLevel lifecycle webhooks, embedded-page
   sessions, and dashboard read APIs.
2. `ingestion-worker` owns historical backfills and canonical agent/call snapshots.
3. `analysis-worker` owns Criterion Set resolution, per-call criterion evaluation,
   evidence validation, and prompt recommendations.
4. `web` is loaded as a HighLevel Custom Page and never receives OAuth credentials.

PostgreSQL is the system of record. SQS carries versioned identifiers between
processes; it never carries transcripts, OAuth tokens, or other unnecessary PII.

## Decision records

- [Canonical visible UI blueprint](./VOICE_AI_OBSERVABILITY_UI_BLUEPRINT.md)
- [ADR 0001: service boundaries](./adr/0001-service-boundaries.md)
- [ADR 0002: inbox, outbox, and delivery semantics](./adr/0002-inbox-outbox-and-delivery.md)
- [ADR 0003: tenant and installation hierarchy](./adr/0003-tenant-installation-hierarchy.md)
- [ADR 0004: evaluation architecture](./adr/0004-evaluation-architecture.md)
- [ADR 0005: product-shaped observability persistence](./adr/0005-product-shaped-observability-model.md)
- [ADR 0006: superseded aggregation design](./adr/0006-release-aware-analysis-and-coalesced-aggregation.md)
- [Breaking observability refactor plan](./BREAKING_OBSERVABILITY_REFACTOR_PLAN.md)
- [Analytics and dashboard redesign](../ANALYTICS_AND_DASHBOARD_DESIGN.md)
