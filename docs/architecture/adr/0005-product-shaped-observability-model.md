---
status: proposed
---

# ADR 0005: Product-shaped observability persistence

Replace the current generic metric/blob persistence with versioned agent Success Criteria,
relational Criterion Results and transcript evidence, separate Call and Agent Analysis runs,
and catalogue-constrained manual Recommendations. This is a breaking replacement rather
than a compatibility migration because the old metric rows, embedded evidence, and
read-time aggregates do not have equivalent meaning in the new dashboard, agent, and call
product contract; the tenant, OAuth, inbox/outbox, and queue boundaries remain unchanged.
