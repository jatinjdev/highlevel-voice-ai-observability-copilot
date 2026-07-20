# Assignment traceability

This document maps the hiring brief to visible behavior, implementation boundaries, and the
proof to show in the demo. It is intentionally concise enough for a manual reviewer to use as
an index into the repository.

## Requirements

| Assignment statement                           | Product behavior                                                                                              | Primary implementation                                                                                      | Demo proof                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Use a HighLevel Marketplace sandbox            | Private Sub-account-targeted app is installed in the App Test Account Location                                | OAuth/install model in `apps/api/src/highlevel`; manual settings in `docs/HIGHLEVEL_INTEGRATION_RUNBOOK.md` | Open the Custom Page from the Location navigation              |
| Integrate into HighLevel                       | Vue dashboard is a Marketplace Custom Page using signed user context                                          | `apps/web`, `apps/api/src/session`                                                                          | Show the HighLevel chrome around the embedded app              |
| Ingest existing Voice AI transcripts           | Manual sync reads agents/call logs and emits canonical durable ingestion events                               | `apps/api/src/pipeline`, `apps/ingestion-worker`                                                            | Show imported calls; explain a repeated sync is convergent     |
| Monitor future calls                           | Signed call-end webhook stores inbox/outbox state and returns before analysis                                 | `apps/api/src/highlevel`, `packages/messaging`                                                              | End a Web Call and show it appear after background processing  |
| Set observability parameters from goals/script | Every agent owns a visible Success Criteria checklist; users add/edit descriptions for goal-specific behavior | `success_criteria`, `SuccessCriteriaService`, agent-page criteria UI                                        | Add a criterion in natural language and show reanalysis queued |
| Identify failures against KPIs                 | One checklist request returns categorical results for every criterion                                         | `criterion-evaluator.ts`, `analysis.service.ts`                                                             | Open a failed call and its checklist                           |
| Unified dashboard across agents                | Fleet list rolls up call counts, duration, and failed-criterion count                                         | `ObservabilityService.dashboard`, `DashboardView.vue`                                                       | Compare the two test agents                                    |
| Immediate recommendations                      | User requests prompt guidance for one failed criterion; it uses recent failures and current prompt            | `RecommendationService`, `RecommendationGenerator`, `RecommendationPanel.vue`                               | Generate guidance and copy the paste-ready instruction         |
| Highlight segments needing review/training     | Failed criteria retain validated evidence IDs and navigate to transcript turns                                | `criterion_result_evidence`, call detail API, call-page highlighting                                        | Click **View evidence** and show the cited line highlight      |

## Evaluation criteria

### Product Thinking and UI/UX

- Fleet, agent, and call views answer three distinct questions: where problems exist, which
  criterion repeats, and what happened in one call.
- There is no aggregate quality score whose meaning a business owner must reverse-engineer.
- The agent page puts calls and the criteria that evaluate them side by side.
- The call page makes the transcript primary and uses red only for flagged evidence.
- Prompt guidance is copy-paste text, not a technical instruction to "edit the prompt."
- HighLevel remains the working context because the app is an embedded Custom Page.

### Completeness

```text
HighLevel log
  -> verified durable inbox
  -> idempotent call normalization
  -> checklist analysis
  -> validated evidence
  -> agent-level failure aggregation
  -> requested prompt guidance
  -> user copies change into HighLevel
  -> later calls re-enter the same loop
```

Both live calls and historical imports enter the same ingestion and analysis path. The system
does not claim to observe the historical prompt version, so call evaluation excludes the prompt.
The current prompt is used only when deciding whether guidance is still needed.

### Technical Integrity

- PostgreSQL is the source of truth; transactional inbox/outbox state prevents acknowledgement
  before durable acceptance.
- SQS messages carry identifiers, while workers reload tenant-scoped content from PostgreSQL.
- Database constraints and consumer claims make repeated webhook/queue delivery safe.
- Zod schemas validate external HTTP, queue, model, and UI boundaries.
- Every model-cited identifier is mapped back to a real stored turn/action; an evidence-free
  model failure becomes `unknown`.
- Recommendation requests are explicit, capped at 20 recent failures, invalidated by prompt
  changes, and protected from stale responses.
- API, ingestion, analysis, and frontend are separate runtime boundaries without pretending
  the assignment needs a large orchestration platform.

### Manual Code Review

The release gate is:

1. `pnpm format:check`;
2. `pnpm check` (lint, typecheck, unit/integration tests, all builds);
3. replay all migrations against disposable PostgreSQL;
4. validate production Compose;
5. build and inspect the non-root production image;
6. exercise the fixture through the actual queues and inspect the three UI views;
7. review the complete branch diff against this assignment and the repository domain model;
8. scan the diff for secrets and generated artifacts before pushing.

## Deliberate scope boundaries

- Recommendations are prompt-only in this assessment. Broader settings such as Knowledge Base,
  boosted keywords, Actions, speech, and call behavior are valid future targets, but suggesting
  them without setting-specific evidence would make the current loop harder to trust.
- Recommendations are not applied automatically; the user remains in control in HighLevel.
- Criteria and prompts are not historically versioned. The UI describes current results and does
  not claim improvement causality across prompt versions.
- Historical sync is operator-triggered. Scheduled pagination and reconciliation are listed as
  production increments rather than mocked behind the demo.
- The AWS deployment uses one host for three isolated processes. Independent compute scaling is
  deferred until workload measurements justify it.

## Submission artifacts

- Repository overview and setup: `README.md`
- HighLevel install/run steps: `docs/HIGHLEVEL_INTEGRATION_RUNBOOK.md`
- Architecture decisions: `docs/architecture/README.md`
- Functional vs. incomplete status: `docs/IMPLEMENTATION_STATUS.md`
- Four-minute walkthrough: `docs/DEMO_SCRIPT.md`
