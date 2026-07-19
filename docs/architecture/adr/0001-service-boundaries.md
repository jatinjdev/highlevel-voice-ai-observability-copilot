# ADR 0001: Service boundaries

- Status: accepted
- Date: 2026-07-15

## Context

Webhook receipt, HighLevel API synchronization, and LLM evaluation have different
latency, failure, and scaling profiles. Deploying every concern in one request path
would make webhook delivery depend on external APIs and model latency.

## Decision

Use three NestJS deployment units: `marketplace-api`, `ingestion-worker`, and
`analysis-worker`. Start with one PostgreSQL cluster and enforce logical ownership
through modules and repositories. Use SQS Standard queues behind a small `QueuePort`
instead of presenting SQS as a native Nest transporter.

## Consequences

- Webhooks can acknowledge after one durable database transaction.
- Workers can scale from queue depth and retry independently.
- At-least-once delivery is explicit, so every consumer must be idempotent.
- A shared database is a deliberate early-stage trade-off. Splitting databases is
  possible later because messages and ownership boundaries are already explicit.
