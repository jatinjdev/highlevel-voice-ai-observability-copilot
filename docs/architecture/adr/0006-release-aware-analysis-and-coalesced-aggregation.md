# ADR 0006: Release-aware analysis and coalesced aggregation

- Status: superseded by ADR 0004
- Date superseded: 2026-07-18

Analysis Releases, call fingerprints, leases, and Analysis Batches remain in use. The
materialized Agent Analysis, Agent Insight, and coalesced Agent Aggregation Job described
by the original decision were removed. Agent-level views are now direct SQL projections
over current Criterion Results, as documented in ADR 0004.
