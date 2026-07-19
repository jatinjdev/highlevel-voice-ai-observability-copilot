# Voice AI Observability UI blueprint

Status: canonical target specification
Date: 2026-07-17
Scope: visible product behavior only

## 1. Purpose

This document defines the complete visible UI for the Voice AI Observability Copilot:
every page, region, reusable visual module, interaction, state, and responsive behavior.
It is intentionally independent of the current Vue structure, HTTP contracts, and
PostgreSQL schema.

The UI specification is the input to the application design. Database tables and API
contracts must be derived later from the information the UI actually needs; existing
storage or transport shapes must not leak into visible modules.

### In scope

- Voice Agents dashboard.
- Voice Agent analysis workspace.
- Individual call analysis workspace.
- Loading, empty, error, mutation, and responsive states.
- Every visible control and its result.
- UI-facing models required to render those states.
- Frontend module seams, state ownership, accessibility, and test surfaces.

### Out of scope

- PostgreSQL tables and migrations.
- HTTP endpoint shapes.
- Queue, webhook, OAuth, and analysis-worker implementation.
- Automatic modification of a HighLevel Voice Agent.
- The internal evaluation algorithm, except where its output is visible.

## 2. Product mental model

The interface has one hierarchy:

```text
Voice Agents
└── Voice Agent
    └── Call
```

Each level answers one question:

| Level        | User question                                                                    |
| ------------ | -------------------------------------------------------------------------------- |
| Voice Agents | Which agent needs my attention?                                                  |
| Voice Agent  | What patterns recur across this agent's calls, and what should I change?         |
| Call         | What happened in this conversation, where is the evidence, and what should I do? |

Navigation must preserve that hierarchy. A user can move from fleet to agent to call,
then back through breadcrumbs without losing meaningful list filters.

## 3. Non-negotiable product rules

1. **No overall score.** Do not invent a weighted quality grade.
2. **Counts lead to evidence.** A flagged count must open or filter to the calls that
   produce it.
3. **One call is enough.** Never hide analysis behind a minimum-call gate.
4. **Agent recommendations are aggregates.** The UI must show both the total analyzed
   cohort and the number of supporting calls for each recommendation.
5. **Call recommendations are specific.** They must link to the transcript evidence that
   caused them.
6. **Recommendations are advisory.** There is no Apply button and no automatic HighLevel
   mutation.
7. **Prompt recommendations contain finished text.** The copy block contains text that can
   be pasted directly into the Voice Agent prompt, not instructions to edit the prompt.
8. **Only flagged transcript evidence is highlighted.** Do not add green highlights for
   ordinary or successful turns.
9. **Sentiment is categorical transcript sentiment.** Show the observable customer-turn
   distribution and rationale; do not show an opaque confidence score or trajectory chart.
10. **Success Criteria are agent-owned configuration.** Users can add and delete both
    system-provided and user-defined criteria. Changes affect this observability product,
    not the HighLevel Voice Agent.
11. **HighLevel Actions are recommendation targets, not observability tasks.** An
    `action` recommendation may propose adding or correcting a documented Voice AI action
    such as appointment booking, workflow, SMS, contact-field update, or transfer. The UI
    does not create a separate human-work queue.
12. **Fixed-height workspaces use internal scrolling.** Agent and call pages must not turn
    into long documents with important regions pushed below the fold.

## 4. Information architecture and routes

The target frontend uses real routes rather than one route with mutually exclusive query
parameters.

| Route                                  | Page                   | Shareable state                             |
| -------------------------------------- | ---------------------- | ------------------------------------------- |
| `/voice-agents`                        | Voice Agents dashboard | `q`                                         |
| `/voice-agents/:agentId`               | Voice Agent workspace  | `q`, `issues`, `criterion`                  |
| `/voice-agents/:agentId/calls/:callId` | Call workspace         | optional `evidence` for a selected citation |

The location is established by the signed embedded session and is not a user-editable
route parameter.

### Navigation behavior

- Browser Back and Forward restore page identity and shareable filters.
- Opening a row changes the route and moves focus to the destination heading.
- Returning from a call restores the agent page search, issue filter, selected criterion,
  and internal scroll position for the call list.
- Breadcrumbs are links, not click handlers on plain text.

---

## 5. Page A: Voice Agents dashboard

### 5.1 Purpose

Provide the fastest possible scan of all Voice Agents in the current HighLevel location
and let the user open the agent that needs investigation.

### 5.2 Desktop anatomy

```text
┌────────────────────────────────────────────────────────────────────┐
│ Voice AI Observability Copilot             [ Search agents... ]   │
│ Review agent performance and open calls that need a decision.      │
├────────────────────────────────────────────────────────────────────┤
│ Agent name │ Calls analyzed │ Avg duration │ Adherence │ Flagged   │
│ Agent row                                                        › │
│ Agent row                                                        › │
└────────────────────────────────────────────────────────────────────┘
```

The page has two visible regions:

1. **Page heading** — product title, one-line purpose, agent search.
2. **Agent fleet table** — one compact row per Voice Agent.

### 5.3 Agent fleet table

| Column           | Visible value                                                                   |
| ---------------- | ------------------------------------------------------------------------------- |
| Agent name       | AI icon, Voice Agent name, and the title of its most important open insight     |
| Calls analyzed   | Calls included in the current completed agent analysis                          |
| Avg. duration    | Human-readable mean call duration                                               |
| Script adherence | Clear divided by observable agent-specific Success Criteria, or `—`             |
| Flagged Issues   | Number of calls with at least one review/critical result or open Recommendation |
| Open             | Chevron indicating navigation                                                   |

The secondary line under the name is descriptive context, never a status phrase such as
“directional” or “insufficient.” If no insight exists, show `No open insight`.

### 5.4 Dashboard interactions

| Control/target       | Trigger             | Result                                                            |
| -------------------- | ------------------- | ----------------------------------------------------------------- |
| Search agents        | Type                | Filters by agent name immediately; preserves the query in the URL |
| Clear search         | Native clear/Escape | Restores all agents                                               |
| Agent row            | Click/Enter/Space   | Opens the selected Voice Agent workspace                          |
| Flagged Issues value | Click/Enter         | Opens that agent with `issues=flagged`                            |

The row is implemented as a real navigation target. It must not be a non-focusable
`<tr>` with a click handler.

### 5.5 Dashboard states

| State                 | Visible behavior                                                         |
| --------------------- | ------------------------------------------------------------------------ |
| Initial loading       | Heading remains stable; table renders row skeletons                      |
| No agents connected   | `No Voice Agents are available for this location.` plus setup guidance   |
| Search has no matches | `No Voice Agents match “{query}”.` and a `Clear search` button           |
| Partial row data      | Render available values; missing values use `—`, never `0`               |
| Load failure          | Inline error panel with `Try again`; keep the heading and search visible |

### 5.6 Compact behavior

At widths below 760 px, the dashboard must not clip columns horizontally.

- Heading and search stack vertically.
- Each desktop row becomes a compact agent card.
- Card header: icon, agent name, open chevron.
- Card facts: calls analyzed, adherence, and flagged calls.
- Average duration may remain as a fourth fact when space permits; it must never push
  Flagged Issues off-screen.

---

## 6. Page B: Voice Agent analysis workspace

### 6.1 Purpose

Show the agent's current operational picture, allow the user to inspect calls and manage
Success Criteria, and surface changes justified by patterns across calls.

### 6.2 Height and region contract

The page occupies one viewport height. The page shell itself does not scroll on desktop.

```text
┌ Breadcrumbs ───────────────────────────────────────────────────────┐
│ Agent name                      [Rerun ▾] [Search calls] [Filter] │
├ Calls analyzed ┬ Avg duration ┬ Adherence ┬ Calls requiring review┤
├──────────────────────────────┬────────────────────────────────────┤
│ Call log                     │ Success criteria                   │
│ independently scrollable     │ independently scrollable           │
│                              │                                    │
├──────────────────────────────┴────────────────────────────────────┤
│ AI recommendations — bottom 30%, horizontally scrollable cards    │
└────────────────────────────────────────────────────────────────────┘
```

Vertical allocation after breadcrumbs/header/summary:

- Review grid: 70% of remaining workspace.
- Agent recommendations: 30% of remaining workspace.
- Call log and Success Criteria lists scroll independently.
- Panel headers remain visible while their lists scroll.

### 6.3 Header

Visible elements:

- Breadcrumb: `Voice Agents › {Agent name}`.
- H1: Voice Agent name.
- Rerun analysis menu button.
- Search calls field.
- Filter icon button with a small active indicator when filtered.

#### Rerun analysis menu

| Menu item     | Supporting text         | Action                                          |
| ------------- | ----------------------- | ----------------------------------------------- |
| Last 24 hours | Queue recent calls      | Queue all eligible calls in the last 24 hours   |
| Last 7 days   | Queue the weekly window | Queue all eligible calls in the last seven days |

Behavior:

- Only one popover may be open at a time.
- Selecting an item closes the menu and changes the button label to `Queueing…`.
- Success toast: `{N} calls queued from the last 24 hours/7 days.`
- Empty success toast: `No calls found in the selected period.`
- Failure toast/banner explains that queueing failed and offers retry.
- Reanalysis keeps the current results visible until newer results are ready.

### 6.4 Summary strip

Four compact read-only facts:

1. Calls analyzed.
2. Average duration.
3. Success-Criterion adherence.
4. Calls requiring review.

They are context, not oversized hero metrics. The third value is `—` when no applicable,
observable agent-specific criteria exist.

### 6.5 Call log panel

#### Header

- `Call log`.
- Result count: `{visible} of {total}`.
- When a criterion filter is selected, show a removable criterion chip before the count.

#### Table

| Column         | Visible value                                  |
| -------------- | ---------------------------------------------- |
| Time           | Localized call date and time                   |
| Duration       | Human-readable duration                        |
| Flagged Issues | Count of review/critical results for this call |
| Open           | Chevron                                        |

#### Call search

Search matches visible time text and a stable call identifier. The user should not need
to know the internal database UUID. Search state is reflected in the URL.

#### Issue filter popover

- All calls.
- Has flagged issues.
- No flagged issues.

The current choice has a checkmark. Selecting `No flagged issues` clears an incompatible
criterion-failure filter.

#### Criterion cross-filter

Clicking a Success Criterion card filters the call log to calls where that criterion is
`review` or `critical`.

- Selected card receives a restrained indigo selected state.
- Call-log header shows the criterion chip.
- Clicking the selected card again or the chip's × clears it.
- Text search, issue filter, and criterion filter combine predictably.
- Result count updates immediately.

#### Call row interaction

Click/Enter opens the individual call workspace. Returning restores call-list scroll and
filters.

### 6.6 Success Criteria panel

#### Header

- `Success criteria`.
- `{N} active`.
- `+ Add criterion` button; changes to `Close` while composer is open.

#### Criterion card

Each card contains only:

- criterion title;
- natural-language expectation;
- `{N} failed` in the bottom-right corner;
- delete × revealed in the top-right on hover/focus;
- selected state when filtering calls.

Do not display origin labels, evaluator versions, `not observable` counts, active badges,
or clear counts on the card.

#### Add criterion composer

Visible inline at the top of the panel:

- Label: `Describe an observable expectation`.
- Multiline natural-language input.
- Concrete example placeholder.
- `Cancel` and `Add criterion` buttons.

Behavior:

- `Add criterion` is disabled until trimmed content meets the minimum length.
- There is no intermediate “review draft” screen.
- Submit label changes to `Adding…` and all criterion mutations are disabled.
- Success inserts the criterion, closes and clears the composer, refreshes failure counts,
  and announces that affected calls are being reanalyzed.
- Failure preserves the user's text and shows an actionable error.
- Cancel/Close discards the unsaved text only after confirmation when the text is nonempty.

#### Delete criterion

Deletion is allowed for system-provided and user-defined criteria.

- Clicking × opens a confirmation dialog naming the criterion.
- Confirm text: `Delete criterion`.
- Cancel returns focus to the originating card.
- While deleting, the confirmation button shows `Deleting…`.
- Success removes the card, clears its call filter if selected, and announces reanalysis.
- Failure leaves the card in place and shows an error.

### 6.7 Agent-level AI recommendations

The panel header contains:

- `AI recommendations`.
- `Aggregated from {N} analyzed calls`.
- recommendation count.

Each card contains:

1. Recommendation kind pill, such as `Prompt`, `Knowledge base`, `Action`, or
   `Transcription`.
2. Evidence scope: `Seen in {N} calls`.
3. Plain-language recommendation headline.
4. Short explanation of the recurring problem and why the change helps.
5. A copy block containing the exact change.
6. Copy icon.

The recommendation planner uses the researched tier hierarchy internally, but the cards do
not show noisy `Primary`, `Feature`, or `Advanced` labels:

- **Primary** — prompt text, trigger instructions for an existing action, fallbacks,
  greeting, greeting pause, and custom values. Prefer these when wording directly fixes
  the observed cause.
- **Feature** — Knowledge Base, documented HighLevel Actions, call settings, language,
  translation, post-call workflows, routing, and reporting. An `Action` card belongs here
  when the agent needs a real operational capability that prompt text cannot provide—for
  example appointment booking, transfer, workflow, SMS, or contact-field update.
- **Advanced** — transcription, pronunciation, speech/audio, behavior, temperature,
  voice/model, system prompts, and outbound configuration. These require stronger evidence
  and an explicit validation plan.

The planner selects the lowest tier that directly resolves the root cause; it does not emit
one card per tier. An `Action` recommendation is therefore an ordinary recommendation card
whose kind pill says `Action`, not a human task and not a separate UI section.

Prompt copy-block label: `Paste this into your agent prompt`.

The copied text must be identical to the visible text. Copy success changes the button to
`Copied` briefly and announces it through a polite live region. The card does not navigate
to a single call because it is an aggregate; a future `View supporting calls` control may
apply the supporting-call filter only when the data can provide exact call IDs.

If there are no justified recommendations, keep the bottom region and show:
`No recommendation is justified by the analyzed calls.`

### 6.8 Agent workspace states

| State                        | Visible result                                                           |
| ---------------------------- | ------------------------------------------------------------------------ |
| Loading                      | Stable shell with skeleton summary, call rows, criteria, recommendations |
| No calls                     | Empty call log; criteria remain configurable                             |
| Search/filter no results     | Contextual message plus clear-filter action                              |
| No Success Criteria          | Empty panel explaining how to add the first criterion                    |
| No recommendations           | Dedicated neutral empty state in the fixed bottom region                 |
| Reanalysis queued/processing | Toast and non-blocking “new analysis pending” state                      |
| Page load failure            | Retry panel; breadcrumb remains available                                |

### 6.9 Compact behavior

Below 760 px the page remains a bounded workspace:

- Breadcrumb and title truncate safely.
- Header controls wrap: search gets the largest width; Filter and Rerun remain reachable.
- Summary becomes a 2 × 2 grid.
- Call log and Success Criteria stack within the 70% review region, each receiving half of
  that region and independent scrolling.
- Recommendation cards become a horizontal snap list; no card is clipped.
- Table columns fit the viewport. Time may wrap once, but the chevron and Flagged Issues
  count remain visible.

---

## 7. Page C: individual call analysis workspace

### 7.1 Purpose

Let a user understand one call from transcript evidence outward: what happened, where it
happened, which criteria failed, and which agent change is worth considering.

### 7.2 Height and region contract

The page occupies one viewport height.

Wide desktop:

```text
┌ Breadcrumbs ───────────────────────────────────────────────────────────────┐
│ ┌ Transcript forensic view (top 2/3) ─────┐ ┌ Call details rail ────────┐│
│ │ independently scrollable transcript      │ │ Summary                   ││
│ │ flagged phrases and callouts              │ │ Sentiment                 ││
│ ├ AI recommendations (bottom 1/3) ─────────┤ │ Criteria                  ││
│ └───────────────────────────────────────────┘ └ independently scrollable ┘│
└────────────────────────────────────────────────────────────────────────────┘
```

The recommendation region remains visible when no recommendation exists so users can
distinguish a completed analysis with no justified change from a missing feature.

### 7.3 Breadcrumb

`{Agent name} › {External call identifier}`

- Agent name links back to the Voice Agent workspace.
- Call identifier truncates in the middle or end without forcing horizontal overflow.

### 7.4 Transcript Forensic View

#### Header

- H1: `Transcript Forensic View`.
- Duration badge.
- `Flagged issues: {N}` badge; red only when `N > 0`.
- `Rerun analysis` button.

`Rerun analysis` queues only this call. It becomes `Queueing…`, then shows
`Call analysis queued.` Results remain visible until replacement results are ready.

#### Transcript list

Each turn contains:

- speaker token (`AI`, `CU`, or `?`);
- agent name, `Customer`, or `Unknown speaker`;
- complete turn text;
- red inline highlights only for cited flagged phrases;
- at most two distinct visible issue callouts below the turn;
- `+N more` when additional issues cite the same turn.

There is no turn-count label and no fabricated timestamp.

#### Evidence interactions

| Target                          | Result                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| Highlighted transcript phrase   | Selects the exact evidence citation and reveals its tooltip/detail  |
| Issue callout below a turn      | Selects the primary issue for that turn                             |
| `View evidence` in details rail | Scrolls transcript to the cited turn and selects the exact phrase   |
| Call recommendation card        | Scrolls transcript to the finding that generated the recommendation |

Selected evidence has one restrained focus treatment. The tooltip contains the issue
title, explanation, and the complete quoted phrase; it must not depend on hover alone.

### 7.5 Call-level AI recommendations

The panel uses the same visual grammar as agent recommendations but intentionally omits
aggregate labels.

Each card contains:

- kind pill;
- headline;
- call-specific rationale;
- exact copy-ready change;
- copy icon.

Clicking the card selects and scrolls to its first supporting evidence citation. Clicking
the copy icon copies without changing evidence selection.

If there are no call recommendations, keep the panel and show:
`No recommendations for this call.`

### 7.6 Call details rail

The rail contains three ordered sections.

#### A. Call summary

- Concise factual summary.
- Intent.
- Outcome (`Success`, `Partial`, `Failure`, or `Not assessed`).

#### B. Call sentiment

- Donut distribution across observable customer turns.
- Dominant categorical label.
- Observable customer-turn count.
- Positive, neutral, and negative counts.
- Short textual rationale.

When no customer turn is assessable, show:
`No customer turn could be assessed from transcript text.`

#### C. Success Criteria checklist

Results are ordered:

1. Critical.
2. Review.
3. Clear.
4. Not observable.
5. Not applicable.

Each row contains:

- status icon (`×`, `!`, `✓`, or `—`);
- criterion title;
- evidence-based rationale;
- `View evidence` only when a review/critical result has a citation.

Red is reserved for critical/review. Green may indicate clear results in this checklist,
but never highlights transcript text.

### 7.7 Rail behavior by width

| Width            | Behavior                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| Wide, >1080 px   | Rail is a permanently visible right column and scrolls independently      |
| Medium, 761–1080 | 56 px right strip labelled Summary/Sentiment/Criteria; expands as overlay |
| Compact, ≤760 px | 52 px right strip; opens a maximum 92vw overlay and never folds below     |

Medium/compact interaction:

- Hover, focus, or click expands the rail.
- The collapsed strip disappears in the expanded state without changing primary-layout
  width.
- Clicking a strip label opens the rail and scrolls its named section into view.
- Clicking the backdrop or pressing Escape closes it.
- No purposeless × button is displayed.
- Focus is trapped inside only while the compact overlay is explicitly opened by click or
  keyboard, not during pointer hover.

### 7.8 Call workspace states

| State                         | Visible result                                                         |
| ----------------------------- | ---------------------------------------------------------------------- |
| Loading                       | Transcript-turn skeletons and rail-card skeletons                      |
| Analysis queued/processing    | Existing result plus non-blocking pending notice                       |
| Analysis not completed        | Transcript remains usable; summary says analysis is pending            |
| No transcript                 | `No transcript was provided for this call.`; details show source facts |
| No flagged issues             | Neutral zero badge, no red highlights, recommendation empty state      |
| No assessable sentiment       | Explicit unavailable copy, no fabricated donut                         |
| Clear criterion               | Green checklist row without View evidence                              |
| Not observable/not applicable | Neutral dash row                                                       |
| Load/reanalysis failure       | Error notice with retry; never erase the previous completed analysis   |

---

## 8. Shared visible modules

These are reusable visual modules, implemented as Vue components where appropriate. They
must remain behavior-rich enough to earn their interface; avoid wrappers that merely pass
props to one HTML element.

| Module                 | Responsibility                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `AppShell`             | Canvas, content width, embedded-safe viewport height, global feedback region        |
| `BreadcrumbTrail`      | Hierarchical links, truncation, focus behavior                                      |
| `SearchField`          | Label, search icon, clear action, keyboard behavior                                 |
| `MenuButton`           | Trigger, exclusive popover state, outside-click/Escape dismissal                    |
| `MetricStrip`          | Compact responsive facts with missing-value handling                                |
| `NavigableDataList`    | Semantic rows/cards, keyboard navigation, loading/empty/error rendering             |
| `PanelFrame`           | Header/body structure and bounded-scroll contract                                   |
| `SuccessCriteriaPanel` | Criteria rendering, composer, filtering, deletion confirmation                      |
| `RecommendationDeck`   | Agent/call variants, copy behavior, evidence selection, empty state                 |
| `TranscriptReview`     | Turns, citation segmentation, callouts, selected evidence, scroll targeting         |
| `CallDetailsRail`      | Wide rail and compact overlay, section navigation, summary, sentiment, and criteria |
| `FeedbackCenter`       | Errors, queued notices, copied notices, retry actions                               |
| `ConfirmationDialog`   | Named destructive confirmation and focus restoration                                |
| `LoadState`            | Skeleton, empty, error, and stale-content patterns                                  |

### 8.1 Recommendation card contract

The card is shared, but scope changes its visible behavior:

| Capability             | Agent scope                     | Call scope                        |
| ---------------------- | ------------------------------- | --------------------------------- |
| Aggregate cohort label | Yes                             | No                                |
| Supporting-call count  | Yes                             | No                                |
| Click card             | Optional supporting-call filter | Select/scroll transcript evidence |
| Copy exact change      | Yes                             | Yes                               |
| Apply automatically    | Never                           | Never                             |

### 8.2 Global feedback

- Errors use an assertive alert and remain until dismissed or resolved.
- Queue/copy/success feedback uses a polite status toast.
- Toasts sit above overlays and collapsed rails; they must never be hidden underneath the
  call sidebar.
- Every async button shows its own busy state and prevents duplicate submission.

### 8.3 Visual language

- Cool off-white canvas; white data surfaces.
- Indigo for navigation, selection, and copied prompt accents.
- Red only for review/critical evidence and destructive confirmation.
- Green only for explicit clear/success states.
- Thin borders and restrained shadows.
- Compact headers; no decorative label strips that consume meaningful workspace height.
- Tabular numerals for durations and counts.
- Minimum interactive target: 36 × 36 px desktop, 44 × 44 px compact/touch.

---

## 9. UI-facing models

These models describe what the UI must know. They are not database entities and do not
dictate persistence. The eventual backend should provide these shapes or a lossless input
that a single adapter can map to them.

```ts
type Loadable<T> =
  | { status: 'loading'; previous?: T }
  | { status: 'ready'; data: T; freshness: 'current' | 'refreshing' }
  | { status: 'empty'; reason: string }
  | { status: 'error'; message: string; previous?: T };

interface VoiceAgentsPageModel {
  agents: AgentListItemModel[];
}

interface AgentListItemModel {
  id: string;
  name: string;
  topInsightTitle: string | null;
  callsAnalyzed: number;
  averageDurationLabel: string | null;
  adherencePercent: number | null;
  flaggedCallCount: number;
}

interface VoiceAgentPageModel {
  agent: { id: string; name: string };
  summary: {
    callsAnalyzed: number;
    averageDurationLabel: string | null;
    adherencePercent: number | null;
    callsRequiringReview: number;
  };
  calls: AgentCallRowModel[];
  criteria: SuccessCriterionCardModel[];
  recommendations: RecommendationCardModel[];
}

interface AgentCallRowModel {
  id: string;
  externalCallId: string;
  occurredAtIso: string;
  occurredAtLabel: string;
  durationLabel: string;
  flaggedIssueCount: number;
  failedCriterionIds: string[];
}

interface SuccessCriterionCardModel {
  id: string;
  title: string;
  expectation: string;
  failedCallCount: number;
}

interface RecommendationCardModel {
  id: string;
  scope: 'agent' | 'call';
  kind: 'prompt' | 'knowledge_base' | 'action' | 'transcription' | 'speech' | 'other';
  headline: string;
  explanation: string;
  exactChange: string;
  copyLabel: string;
  analyzedCallCount?: number;
  supportingCallCount?: number;
  supportingCallIds?: string[];
  primaryEvidenceId?: string;
}

interface CallPageModel {
  call: {
    id: string;
    externalCallId: string;
    agentId: string;
    agentName: string;
    durationLabel: string;
    flaggedIssueCount: number;
  };
  transcript: TranscriptTurnModel[];
  details: CallDetailsModel;
  recommendations: RecommendationCardModel[];
}

interface TranscriptTurnModel {
  id: string;
  speaker: 'agent' | 'customer' | 'unknown';
  speakerLabel: string;
  text: string;
  citations: EvidenceCitationModel[];
}

interface EvidenceCitationModel {
  id: string;
  turnId: string;
  startCharacter: number;
  endCharacter: number;
  quote: string;
  title: string;
  explanation: string;
  severity: 'review' | 'critical';
}

interface CallDetailsModel {
  summary: string | null;
  intentLabel: string | null;
  outcomeLabel: string | null;
  sentiment: SentimentModel | null;
  criteria: CriterionResultModel[];
}

interface SentimentModel {
  dominantLabel: 'positive' | 'neutral' | 'negative';
  observableTurnCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  rationale: string;
}

interface CriterionResultModel {
  id: string;
  title: string;
  status: 'critical' | 'review' | 'clear' | 'not_observable' | 'not_applicable';
  rationale: string;
  primaryEvidenceId: string | null;
}
```

Important consequences:

- Supporting-call count is a real field, not parsed from recommendation prose.
- Exact copy text is a real field, not transformed in the rendering layer.
- Evidence selection uses stable citation IDs, not reconstructed string keys.
- Dates and durations may be formatted in a presentation adapter so all pages agree.
- Missing data is nullable and rendered deliberately, never silently converted to zero.

---

## 10. Frontend architecture

### 10.1 Design objective

Build deep modules: small interfaces that hide meaningful behavior. Page files assemble
modules; they do not own data fetching, URL synchronization, menu exclusivity, mutation
lifecycles, evidence mapping, scroll restoration, clipboard feedback, or responsive rail
state.

### 10.2 Target source layout

```text
apps/web/src/
  app/
    AppShell.vue
    router.ts
    bootstrap.ts
  observability/
    observability.repository.ts
    observability.http-adapter.ts
    observability.memory-adapter.ts
    models.ts
  voice-agents/
    VoiceAgentsPage.vue
    fleet-workspace.ts
    AgentFleet.vue
  agent-review/
    VoiceAgentPage.vue
    agent-review-workspace.ts
    AgentHeader.vue
    AgentSummary.vue
    CallLogPanel.vue
    SuccessCriteriaPanel.vue
  call-review/
    CallReviewPage.vue
    call-evidence-workspace.ts
    TranscriptReview.vue
    CallDetailsRail.vue
  recommendations/
    RecommendationDeck.vue
    recommendation-copy.ts
  feedback/
    feedback-center.ts
    FeedbackViewport.vue
    ConfirmationDialog.vue
  shared/
    ui/
    formatting/
    testing/
```

Folders are organized by product capability, not by generic `components`, `composables`,
and `utils` buckets.

### 10.3 Deep modules and interfaces

#### `ObservabilityRepository`

The seam between the frontend product and remote data.

```ts
interface ObservabilityRepository {
  loadVoiceAgents(signal?: AbortSignal): Promise<VoiceAgentsPageModel>;
  loadVoiceAgent(agentId: string, signal?: AbortSignal): Promise<VoiceAgentPageModel>;
  loadCall(agentId: string, callId: string, signal?: AbortSignal): Promise<CallPageModel>;
  execute(command: ObservabilityCommand, signal?: AbortSignal): Promise<CommandResult>;
}
```

Production uses an HTTP adapter. Tests use an in-memory adapter, making this a real seam.
Transport validation and mapping stay inside the production adapter.

#### `FleetWorkspace`

Interface:

```ts
interface FleetWorkspace {
  readonly state: Readonly<FleetWorkspaceState>;
  setQuery(query: string): void;
  retry(): Promise<void>;
}
```

It owns loading, search normalization, URL query synchronization, empty-state selection,
and retry behavior.

#### `AgentReviewWorkspace`

Interface:

```ts
interface AgentReviewWorkspace {
  readonly state: Readonly<AgentReviewState>;
  dispatch(action: AgentReviewAction): Promise<void>;
}
```

It hides call search, issue/criterion filter composition, exclusive popovers, call-list
scroll restoration, criterion composer state, reanalysis mutations, deletion confirmation,
and derived visible counts.

#### `CallEvidenceWorkspace`

Interface:

```ts
interface CallEvidenceWorkspace {
  readonly state: Readonly<CallEvidenceState>;
  selectEvidence(evidenceId: string, source: EvidenceSelectionSource): Promise<void>;
  openRail(section?: CallRailSection): void;
  closeRail(): void;
}
```

It owns citation lookup, transcript segmentation, selected evidence, DOM scroll targeting,
recommendation-to-evidence mapping, criterion-to-evidence mapping, rail section navigation,
and compact overlay behavior. Transcript and rail modules consume this interface instead of
reimplementing evidence logic.

#### `RecommendationDeck`

Interface:

```ts
interface RecommendationDeckProps {
  scope: 'agent' | 'call';
  items: RecommendationCardModel[];
  onCopy(id: string): void;
  onSelectEvidence?(evidenceId: string): void;
}
```

Scope-specific rules remain inside the module. Callers do not calculate support labels,
copy labels, or card clickability.

#### `FeedbackCenter`

One interface handles toast stacking, live-region priority, error persistence, timers, and
overlay-safe placement. Pages issue semantic events such as `analysisQueued` or
`recommendationCopied`; they do not position notices directly.

### 10.4 State ownership

| State                             | Owner                   | URL persisted |
| --------------------------------- | ----------------------- | ------------- |
| Current route/entity              | Router                  | Yes           |
| Dashboard search                  | Fleet workspace         | Yes           |
| Agent call search                 | Agent review workspace  | Yes           |
| Issue filter                      | Agent review workspace  | Yes           |
| Selected criterion filter         | Agent review workspace  | Yes           |
| Call-list scroll position         | Agent review workspace  | Session only  |
| Open popover                      | Agent review workspace  | No            |
| Criterion composer text           | Agent review workspace  | No            |
| Selected transcript evidence      | Call evidence workspace | Optional      |
| Compact details rail open/section | Call evidence workspace | No            |
| Async command status              | Owning workspace        | No            |
| Toasts/errors                     | Feedback center         | No            |

There must be one source of truth for each state. Derived values are computed, never
copied into additional mutable refs.

### 10.5 Interaction state machines

#### Async commands

```text
idle → submitting → success → idle
                  ↘ failure → idle/retry
```

- Duplicate submission is impossible in `submitting`.
- Previous read data remains visible.
- Success and failure feedback is explicit.

#### Criterion composer

```text
closed → editing-invalid → editing-valid → submitting → closed
                                      ↘ failure → editing-valid
```

#### Evidence selection

```text
none → selected(evidenceId, source) → selected(other evidence) → none
```

Every source—transcript phrase, callout, recommendation, or checklist—dispatches
the same selection operation.

### 10.6 Menu discipline

The Agent page currently allows multiple menus to remain open. The target uses one popover
controller:

- opening Rerun closes Filter;
- opening Filter closes Rerun;
- outside click and Escape close the active popover;
- focus returns to the trigger;
- navigation or route change closes all popovers.

### 10.7 Responsive layout implementation

- Use CSS Grid for page regions and container queries for panel internals.
- Fixed workspace rows use `minmax(0, ...)`; every scrollable descendant has `min-height: 0`.
- Do not solve compact layouts by clipping a desktop table.
- Use cards below the dashboard table breakpoint.
- Keep the call details rail mounted so focus and scroll state survive opening/closing.
- Respect `prefers-reduced-motion` for smooth evidence scrolling and rail transitions.

---

## 11. Accessibility contract

- One H1 per page; panel titles use H2; recommendation headlines use H3.
- Search fields have visible or programmatic labels.
- Rows are links or buttons with visible focus indicators.
- Count-only columns include descriptive headers.
- Popovers expose `aria-expanded`, close on Escape, and restore focus.
- Selected filters use `aria-pressed` or current-value semantics.
- Evidence highlights are buttons with full accessible names and pressed state.
- Evidence tooltips are reachable by focus and not hover-only.
- Copy buttons announce success.
- Busy buttons expose `aria-busy` and remain descriptively labelled.
- Confirmation dialogs trap focus and name the item being deleted.
- Status is never communicated by color alone.
- Tables preserve header associations; compact card replacements keep equivalent labels.
- The call rail overlay uses a labelled dialog/complementary region and a dismissible
  backdrop.

---

## 12. Required visible test coverage

Tests operate through module interfaces and user-visible outcomes, not implementation refs.

### 12.1 Fleet flows

- Load agents.
- Search and clear search.
- No-agent and no-search-result states.
- Open agent by pointer and keyboard.
- Open flagged calls directly.
- Compact card layout has no clipped facts.

### 12.2 Agent flows

- Open/close mutually exclusive Rerun and Filter menus.
- Queue 24-hour and 7-day reanalysis; success, empty, failure.
- Combine search, issue filter, and criterion filter.
- Select and clear a criterion filter.
- Open a call and restore list state on return.
- Add criterion: invalid, valid, submitting, success, failure, dirty cancel.
- Delete any criterion: cancel, confirm, success, failure.
- Agent recommendation displays total analyzed cohort and supporting-call count.
- Copy exact visible recommendation text and receive feedback.
- Independent call/criteria/recommendation scrolling.

### 12.3 Call flows

- Flagged call with highlights, callouts, recommendations, and failed criteria.
- Clear call with no recommendations.
- Not-observable/not-applicable criteria.
- Missing sentiment and missing transcript states.
- Select evidence from phrase, callout, recommendation, and criterion.
- Each evidence source scrolls to and selects the same citation.
- Rerun one call: busy, queued, failure.
- Wide rail, medium strip/overlay, and compact overlay.
- Section label opens and scrolls the correct rail section.
- Escape/backdrop close behavior.
- Copy prompt does not change selected evidence.

### 12.4 Quality gates

- Runtime contract validation at the repository adapter.
- Unit tests at workspace interfaces.
- Render tests for visible modules.
- Browser tests for the three primary journeys.
- Visual regression at wide desktop, embedded medium, and compact widths.
- Automated accessibility scan plus keyboard-only journey.
- No page-level snapshot test may replace behavioral assertions.

---

## 13. Rewrite plan

This is a replacement, not an incremental layering exercise.

1. Introduce real routes and `AppShell`.
2. Define UI-facing models and the `ObservabilityRepository` seam.
3. Build the HTTP and in-memory adapters.
4. Implement `FleetWorkspace` and the dashboard.
5. Implement `AgentReviewWorkspace`, Call Log, and Success Criteria as one vertical slice.
6. Implement shared `RecommendationDeck` with exact-copy behavior.
7. Implement `CallEvidenceWorkspace`, Transcript Review, and Call Details Rail.
8. Add global Feedback Center and confirmation dialog.
9. Implement responsive card/table/rail variants.
10. Replace old page tests with interface-level and browser journey tests.
11. Delete the monolithic view and obsolete CSS after route parity is complete.

The deletion test for the new modules is deliberate: removing `AgentReviewWorkspace`
should force filter composition, mutation lifecycles, popover exclusivity, and scroll
restoration back into multiple callers. Removing `CallEvidenceWorkspace` should force
citation mapping and scroll behavior back into Transcript, Recommendations, Criteria, and
the details rail. That is the depth those modules must provide.

## 14. Definition of done

The UI is complete when:

- all three routes are directly loadable and navigable;
- every control in this document has loading, success, error, keyboard, and responsive
  behavior where applicable;
- agent recommendations visibly communicate aggregate evidence;
- call recommendations and checklist findings navigate to exact transcript evidence;
- prompt copy blocks contain literal paste-ready prompt text;
- Success Criteria can be added and deleted safely;
- HighLevel action recommendations appear only when supported by evidence and use the same
  recommendation cards as every other configuration target;
- no compact viewport clips tables, controls, toasts, or the right rail;
- page files are orchestration-only and behavior is tested through deep module interfaces;
- no UI behavior depends on parsing prose or reconstructing IDs;
- backend contracts and persistence can be replaced without changing visible module
  interfaces.
