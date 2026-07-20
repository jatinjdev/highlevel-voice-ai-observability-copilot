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
3. `analysis-worker` owns per-agent Success Criteria initialization, per-call checklist
   evaluation, evidence validation, and requested agent-level prompt recommendations.
4. `web` is loaded as a HighLevel Custom Page and never receives OAuth credentials.

PostgreSQL is the system of record. SQS carries versioned identifiers between
processes; it never carries transcripts, OAuth tokens, or other unnecessary PII.

## Current decision records

- [ADR 0001: service boundaries](./adr/0001-service-boundaries.md)
- [ADR 0002: inbox, outbox, and delivery semantics](./adr/0002-inbox-outbox-and-delivery.md)
- [ADR 0003: tenant and installation hierarchy](./adr/0003-tenant-installation-hierarchy.md)
- [ADR 0007: checklist-only calls and manual agent recommendations](./adr/0007-manual-agent-recommendations.md)

ADR 0007 supersedes the earlier evaluation and aggregation decisions. The UI blueprint,
breaking-refactor plan, capability catalogue, and analytics redesign remain historical research
records rather than current product contracts.
