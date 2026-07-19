# ADR 0004: Criterion-centric evaluation architecture

- Status: accepted
- Date: 2026-07-18
- Supersedes: the earlier findings-and-cohort form of this ADR and ADR 0006

## Context

The previous pipeline represented the same judgment as a Criterion Result, Finding,
Insight, and Recommendation Candidate. It also ran a separate Agent Analysis pipeline.
Those parallel representations could disagree and made a failed call difficult to trace
from the UI back to the evaluator.

## Decision

`CriterionResult` is the single judgment in the system. For every active criterion and
call, the evaluator returns exactly one of `pass`, `fail`, `not_applicable`, or `unknown`,
plus a one-sentence rationale and transcript turn IDs. A `fail` without valid transcript
evidence is stored as `unknown`.

The call-analysis flow is deliberately linear:

1. load the call, immutable configuration snapshot, active Criterion Set, turns, and
   action events;
2. make one schema-constrained model request that evaluates each criterion independently;
3. validate aliases and evidence locally;
4. persist Criterion Results and direct Criterion Result-to-turn links;
5. derive at most one paste-ready prompt Recommendation from each failed criterion when
   that criterion permits a real prompt target.

The evaluator does not infer intent, sentiment, root cause, prompt fixes, or hidden
configuration. There is no weighted score and no separate Finding model.

Agent views are SQL projections over current call analyses. A criterion's failure count is
the number of current calls whose result is `fail`; an aggregate Recommendation's support
count is the number of those calls that produced the same criterion-and-target pair. There
is no agent-analysis queue, cache, or materialized agent judgment that can become stale.

Analysis Releases, configuration snapshots, Criterion Sets, leases, input fingerprints,
and Analysis Batches remain because they provide reproducibility, idempotency, and bounded
reanalyzes without adding a second meaning for the result.

## Consequences

- An engineer can trace every visible issue through Recommendation → Criterion Result →
  transcript turns.
- A user sees the same criterion language at call and agent level.
- New calls appear in aggregates as soon as their call analysis transaction commits.
- Reruns replace the current projection without rebuilding an agent artifact.
- More advanced recommendation targets can be added behind the same planner interface,
  but they must remain direct consequences of failed criteria.
- The breaking migration discards legacy analysis outputs and requires existing calls to
  be reanalyzed under the new result semantics.
