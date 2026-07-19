# ADR 0003: Tenant and installation hierarchy

- Status: accepted
- Date: 2026-07-15

## Context

HighLevel has agency/company and sub-account/location scopes. An agency installation
can grant multiple locations, while a direct sub-account installation grants one.
OAuth callback and lifecycle webhooks may arrive in either order.

## Decision

Represent the hierarchy explicitly:

```text
company
  location

marketplace installation
  installation location grant -> location
    OAuth credential (encrypted at rest)
```

An installation is keyed by the HighLevel app plus its company or location subject.
Callbacks and webhooks upsert provisional records and later reconcile them. Uninstall
revokes the affected grants and credentials without deleting historical analyses.

All dashboard reads require an authorized location context. External HighLevel IDs
are boundary identifiers; internal UUIDs are used for relations and queue payloads.

## Consequences

- Agency and location installs do not collapse into one token row.
- Location isolation is enforceable in repositories and test fixtures.
- Historical records remain auditable after uninstall while access is immediately
  disabled.
