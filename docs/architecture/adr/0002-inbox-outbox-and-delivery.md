# ADR 0002: Inbox, outbox, and delivery semantics

- Status: accepted
- Date: 2026-07-15

## Context

HighLevel retries webhooks and SQS Standard queues deliver at least once. Publishing
to SQS directly inside the HTTP handler creates a dual-write problem: the database
and queue can disagree after a partial failure.

## Decision

Verify the HighLevel Ed25519 signature over the exact request bytes. In one database
transaction:

1. insert the webhook into `webhook_inbox` using a stable idempotency key;
2. apply lifecycle state changes when relevant; and
3. insert a versioned message into `message_outbox`.

A publisher leases unpublished outbox rows, sends identifier-only envelopes to SQS,
and marks them published. Consumers record their own idempotency key before applying
effects. A duplicate is successful work, not an error.

## Consequences

- No acknowledged webhook can be lost between PostgreSQL and SQS.
- A crash after SQS publish but before `published_at` can publish twice; consumers
  therefore remain idempotent.
- Poison messages move to a DLQ after bounded retries and retain correlation IDs for
  diagnosis.
