# Analytics and dashboard redesign

> The check applicability, HighLevel capability, and recommendation-target rules in
> [CAPABILITY_AWARE_EVALUATION.md](./CAPABILITY_AWARE_EVALUATION.md) supersede generic
> deterministic thresholds in this earlier design.

- Status: proposed for implementation
- Date: 2026-07-16
- Replaces: the single-score dashboard projection and one-analysis-per-call model

## Product objective

The dashboard must answer three different questions without conflating them:

1. **What happened on this call?** Show the outcome, exact failure moments,
   sentiment trajectory, action execution, and evidence.
2. **How is this agent behaving over time?** Show stable KPI trends, recurring
   failure modes, intent-adjusted sentiment, operational reliability, and prompt
   version effects.
3. **What should the customer change next?** Recommend an agent, prompt, script,
   or workflow change only when the evidence and cohort size support it.

The current projection cannot answer these questions. It stores one mutable analysis
per call, asks one model for a free-form 0–100 score, stores criterion detail inside a
JSON finding list, and reduces an agent to call count, mean score, and failures. That
prevents evaluator comparisons, prompt attribution, drill-down, uncertainty reporting,
and statistically defensible agent insights.

## Measurement principles

1. **Facts and judgments are different data products.** Deterministic extractors own
   observable facts. Model judges own semantic interpretation. A resolver combines
   them using an explicit, versioned formula.
2. **No false precision.** Model judges select anchored ordinal levels or categorical
   labels. Application code converts those levels to normalized scores.
3. **Not applicable is not failure.** Missing evidence, unavailable timing, or an
   irrelevant criterion reduces coverage; it does not silently become zero.
4. **Sentiment is context, not ground truth.** A difficult support call may begin
   negative even when the agent performs perfectly. Measure trajectory and recovery,
   segmented by intent, rather than directly rewarding positive language.
5. **Every result is reproducible.** Persist the call input fingerprint, agent version,
   rubric version, metric-suite version, extractor version, judge prompt version,
   provider/model, and run reason.
6. **Online product trends and evaluator experiments are separate.** Production trend
   charts use one frozen evaluation suite. New judges run in shadow against the same
   calls and are compared as experiments before promotion.
7. **Agent recommendations require cohorts.** A single call may produce a call-level
   suggestion or urgent human action. It should not become an agent-level prompt
   recommendation unless it is critical or recurs across enough comparable calls.

## Available evidence and fidelity

The current HighLevel data provides transcript text, duration, summary, extracted
fields, executed action metadata, and some action timestamps. It does not guarantee
word-level timestamps, silence spans, interruptions, acoustic emotion, or prosody.

The product must expose an `evidenceCoverage` object on every call:

```json
{
  "transcript": "available",
  "speakerTurns": "derived",
  "turnTimestamps": "unavailable",
  "actionEvents": "available",
  "actionTimestamps": "partial",
  "audio": "unavailable",
  "agentSpecification": "snapshot_at_ingestion"
}
```

Consequences:

- call and action duration metrics are valid;
- turn counts and repetition can be derived from the transcript;
- response latency, silence, interruptions, and talk-over must remain unassessed until
  timestamped turns or audio are available;
- current sentiment is **text sentiment**, not vocal emotion;
- historical calls synced after an agent prompt changed need an explicit
  `agentVersionConfidence: inferred_current` flag unless HighLevel supplies the
  historical specification.

## Versioned metric suite

Each metric is a stable, typed definition rather than an ad hoc model field.

```ts
interface MetricDefinition {
  key: string; // stable across compatible versions
  version: number;
  title: string;
  dimension: 'outcome' | 'policy' | 'conversation' | 'operations' | 'sentiment' | 'opportunity';
  valueType: 'boolean' | 'ordinal' | 'number' | 'category';
  direction: 'higher_is_better' | 'lower_is_better' | 'diagnostic_only';
  assessor: 'deterministic' | 'llm' | 'hybrid';
  applicability: Record<string, unknown>;
  scale: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  aggregation: 'mean' | 'median' | 'rate' | 'percentile' | 'distribution';
  weight: number; // only for scored, applicable metrics
}
```

### Canonical scored dimensions

The rubric compiler maps the agent's goal and script onto these canonical dimensions,
then adds atomic agent-specific success criteria.

| Dimension             | Default weight | Primary assessor | Examples                                                         |
| --------------------- | -------------: | ---------------- | ---------------------------------------------------------------- |
| Goal and resolution   |             30 | Hybrid           | intent understood, business goal completed, next step clear      |
| Script and policy     |             25 | Hybrid           | required steps, disclosures, forbidden claims, data collection   |
| Conversation quality  |             20 | Hybrid           | relevance, clarity, empathy, repetition, concision               |
| Action execution      |             15 | Hybrid           | expected action selected, execution success, action latency      |
| Escalation and safety |             10 | Hybrid           | uncertainty recognition, escalation, unsafe commitment avoidance |

Weights are defaults, not constants. An appointment agent may weight booking outcome
more heavily; a regulated support agent may weight policy and escalation more heavily.
The compiled weights and anchored levels are immutable within a rubric version.

### Anchored model judgments

The model does not invent a 0–100 value. For each semantic criterion it selects one
anchored level:

| Level | Normalized score | Meaning                                |
| ----: | ---------------: | -------------------------------------- |
|     0 |                0 | Clear failure or harmful contradiction |
|     1 |               25 | Major requirement missed               |
|     2 |               50 | Partially achieved with a material gap |
|     3 |               75 | Achieved with a minor gap              |
|     4 |              100 | Fully and explicitly achieved          |

Each criterion has criterion-specific descriptions for levels 0–4. Binary facts use a
boolean or categorical label instead. This avoids the false distinction between model
scores such as 82 and 84.

## Call-level analysis

### Deterministic feature extraction

These features are computed by versioned code and can be reproduced exactly:

- data completeness: transcript/prompt/action/timing availability;
- call duration and early termination;
- parsed turn count by speaker, word counts, and speaker share;
- duplicate or near-duplicate agent turns using normalized token similarity;
- repeated customer question or unresolved-loop count;
- required exact disclosures or phrases when the rubric explicitly requires exact text;
- extracted-field presence and schema validity;
- action count and type, expected-versus-observed action, execution status, and latency;
- transfer/escalation/hang-up event presence when supplied;
- terminal closing count and calls that continue after a complete closing;
- deterministic policy violations such as forbidden literal claims or missing required
  identifiers, when those policies are machine-checkable.

Deterministic features remain raw measurements. A metric definition maps them to a
pass/fail or normalized component score. For example, duplicate-closing count is a
fact; whether it materially hurt conversation quality remains a semantic judgment.

### Model analysis

The model receives the agent snapshot, atomic rubric, transcript with stable turn IDs,
safe action metadata, and deterministic feature summary. It returns:

- primary and secondary intent;
- resolution state (`resolved`, `partially_resolved`, `unresolved`, `transferred`,
  `abandoned`, or `not_applicable`);
- anchored semantic criterion judgments;
- text-sentiment trajectory and frustration turning points;
- policy or unsupported-claim risks;
- missed opportunities tied to the agent goal;
- failure-mode taxonomy labels;
- evidence-backed call suggestions and human-review candidates.

It does **not** return the final score or agent-level recommendation.

### Sentiment methodology

Sentiment is measured on customer turns using a five-level ordinal scale:

```text
-2 strongly negative/frustrated
-1 negative/concerned
 0 neutral, mixed, or insufficient evidence
+1 positive/satisfied
+2 strongly positive/delighted
```

Store at least the opening, lowest point, and closing observation plus material turning
points. Each observation requires a transcript turn and confidence. Derive:

- `initialSentiment`
- `minimumSentiment`
- `finalSentiment`
- `sentimentLift = final - initial`
- `recovery = final - minimum`
- `trajectory = improved | stable | worsened | mixed | insufficient_evidence`
- `negativeEnding = final < 0`
- `frustrationRecovered = minimum < 0 && final >= 0`

Do not add raw final sentiment to the overall quality score. Use recovery as a
diagnostic and, only for suitable support/retention intents, as a low-weight rubric
component. Segment agent-level sentiment by intent because inbound complaints and
sales enquiries have different starting distributions.

If audio or timed turns become available later, add separate acoustic measures. Never
silently mix text sentiment and vocal emotion into the same metric key.

### Hybrid resolution

Each final call metric retains its component assessments:

```ts
interface MetricResult {
  metricKey: string;
  metricVersion: number;
  applicable: boolean;
  normalizedScore: number | null;
  label: string | null;
  passed: boolean | null;
  coverage: number; // 0..1
  confidence: number; // calibrated later; evidence strength initially
  components: Array<{
    assessor: 'deterministic' | 'llm';
    assessorVersion: string;
    weight: number;
    rawValue: unknown;
    normalizedScore: number | null;
    confidence: number;
  }>;
  disagreement: null | {
    kind: 'score_gap' | 'fact_conflict' | 'missing_evidence';
    delta?: number;
  };
}
```

Resolution rules:

1. Deterministic evidence is authoritative for observable events: an action event
   either exists or does not; the model cannot override that fact.
2. The model is authoritative only for defined semantic judgments such as empathy or
   whether a next step was understandable.
3. Hybrid metrics combine applicable components using declared weights:

```text
metricScore = Σ(componentScore × componentWeight) / Σ(applicableComponentWeight)
```

4. The overall score uses applicable scored metrics only:

```text
overallScore = Σ(metricScore × metricWeight) / Σ(applicableMetricWeight)
scoreCoverage = Σ(applicableMetricWeight) / Σ(expectedMetricWeight)
```

5. A factual conflict or component gap above a configured threshold creates a
   disagreement finding and can require human review. It is not averaged away.

### Proposed structured model output

```json
{
  "schemaVersion": 2,
  "intent": {
    "primary": "order_request",
    "secondary": [],
    "confidence": 0.96,
    "evidence": [{ "turnId": "t2", "quote": "I want to place an order" }]
  },
  "resolution": {
    "status": "partially_resolved",
    "confidence": 0.91,
    "evidence": [{ "turnId": "t7", "quote": "a team member will reach out" }]
  },
  "criteria": [
    {
      "key": "goal_completion",
      "level": 3,
      "applicable": true,
      "confidence": 0.88,
      "rationale": "A valid follow-up path was created, but no immediate order was placed.",
      "evidence": [{ "turnId": "t7", "quote": "a team member will reach out" }]
    }
  ],
  "sentiment": {
    "observations": [
      { "phase": "opening", "turnId": "t2", "value": 0, "confidence": 0.72 },
      { "phase": "closing", "turnId": "t12", "value": 1, "confidence": 0.83 }
    ],
    "trajectory": "improved",
    "turningPoints": []
  },
  "failureModes": [
    {
      "key": "duplicate_closing",
      "severity": "low",
      "confidence": 0.95,
      "evidence": [{ "turnId": "t13", "quote": "Thanks again for your time" }]
    }
  ],
  "opportunities": [],
  "callSuggestions": [],
  "humanReviewCandidates": []
}
```

Evidence validation resolves `turnId`, verifies that the quote is contained in that
turn, and stores the corresponding evidence record. Invalid evidence reduces coverage
and confidence; it is never displayed as fact.

## Agent-level analytics

Agent insights are derived from comparable call-level metric rows. They are not a
second unconstrained transcript summarization.

### Core agent metrics

For a selected period and prompt version:

- analyzed call count, evidence coverage, and data-quality rate;
- outcome success rate with a Wilson confidence interval;
- overall median, mean, p10, and distribution—not only mean;
- per-KPI mean/median, pass rate, coverage, and trend;
- intent distribution and outcome rate by intent;
- negative-ending rate, sentiment lift, and frustration-recovery rate by intent;
- failure-mode frequency and severity-weighted Pareto ranking;
- action execution success and p50/p95 latency by action type;
- escalation rate and inappropriate-escalation finding rate;
- open critical Recommendations and affected-call count.

### Recurring insight rules

Generate candidates deterministically from aggregates, then optionally ask the model to
word them clearly. Examples:

- **Observed issue:** surface an evidence-backed failure from the first call and link
  directly to that conversation.
- **Recurring issue:** once the same failure appears again, group the affected calls as
  one pattern instead of creating a separate threshold-gated view.
- **Material regression:** current-period KPI delta exceeds its configured practical
  threshold and the uncertainty interval does not substantially overlap zero.
- **Limited evidence:** show the observation and exact sample size without suppressing it;
  avoid causal or population-wide language that the available calls cannot support.
- **Operational regression:** action failure rate or p95 latency breaches a fixed SLO.
- **Sentiment risk:** intent-adjusted negative-ending rate rises materially, with the
  exact affected calls linked.

Show `n` wherever it helps interpret an aggregate, but do not gate agent insights or
reviews behind a minimum call count. One analyzed call is enough to surface a concrete
finding. Statistical before/after claims may require uncertainty treatment, but that is
separate from whether the product shows the evidence and suggests a next step.

### Prompt-version comparison

Every call must reference an `agent_version_id`. The agent page places prompt versions
on the same timeline as calls and metrics.

For before/after comparison:

1. select calls from two explicit agent versions;
2. control or stratify by primary intent where volume permits;
3. evaluate both cohorts with the same metric-suite and judge versions;
4. report sample size, absolute delta, relative delta, and uncertainty interval;
5. report practical effect size in addition to statistical significance;
6. show regressions as well as improvements per KPI;
7. never compare scores produced by different evaluator suites without either
   re-evaluating both cohorts or labelling the comparison as an evaluator change.

Recommended summaries:

- Wilson interval and two-proportion comparison for pass/success rates;
- bootstrap interval for score medians and mean deltas;
- standardized effect size for continuous score comparisons;
- distribution shift for intents and failure modes, only at adequate volume.

### Recommendation lifecycle

Separate three concepts:

1. `call_suggestion`: one-call coaching note;
2. `agent_insight`: recurring measured pattern across a cohort;
3. `recommendation`: proposed change linked to one or more insights, an expected KPI
   effect, evidence calls, and a lifecycle.

Recommendation states:

```text
draft → accepted → deployed(agent version) → measuring → validated | inconclusive | regressed | dismissed
```

After deployment, compare the new agent version with the baseline. This closes the loop
from diagnosis to measured impact instead of ending at generated advice.

## Persistence model

### New or revised tables

#### `agent_versions`

- `id`, `agent_id`, `version`
- `prompt_hash`, `prompt_snapshot`, `goal_snapshot`, `action_spec_snapshot`
- `source` and `source_confidence`
- `effective_from`, `effective_to`, `created_at`

#### `evaluation_suites`

- `id`, `name`, `version`, `status`
- `metric_definitions` JSON or normalized child rows
- `deterministic_extractor_version`
- `judge_prompt_version`, `output_schema_version`
- `created_at`, `promoted_at`

#### `analysis_runs`

- `id`, `call_id`, `agent_version_id`, `rubric_id`, `evaluation_suite_id`
- `run_reason`: `initial | retry | manual | shadow | backtest`
- `input_fingerprint`, `judge_config_hash`, `code_version`
- `provider`, `model`, `model_parameters`
- `status`, `started_at`, `completed_at`, `latency_ms`
- `input_tokens`, `output_tokens`, `estimated_cost`
- `overall_score`, `score_coverage`, `confidence`, `outcome`
- `is_primary`, `error`

There is no unique constraint on `call_id`. Use an idempotency key covering the call,
input fingerprint, suite, and run reason. Only one run is primary for a given call and
suite, while shadow/backtest runs remain queryable.

#### `assessment_results`

- `id`, `analysis_run_id`, `metric_key`, `metric_version`
- `assessor_type`: `deterministic | llm | human`
- `assessor_version`
- typed raw value, normalized component score, label, pass, applicability, confidence
- rationale and execution metadata

#### `metric_results`

- `id`, `analysis_run_id`, `metric_key`, `metric_version`
- resolved typed value, normalized score, label, pass, applicability
- coverage, confidence, disagreement state
- unique `(analysis_run_id, metric_key, metric_version)`

#### `evidence_spans`

- `id`, `analysis_run_id`, optional `metric_result_id`
- `source_type`: `transcript_turn | action_event | call_field`
- `turn_id`, `speaker`, `start_ms`, `end_ms`, `quote`, `quote_hash`
- action/field reference and validation state

#### `sentiment_observations`

- `id`, `analysis_run_id`, `turn_id`, `phase`
- ordinal value, label, confidence, evidence span
- source model and sentiment schema version

#### `findings`

Normalize the current JSON list so findings can be filtered and aggregated:

- `id`, `analysis_run_id`, `metric_result_id`, `taxonomy_key`
- severity, title, rationale, confidence, status
- deterministic/semantic/hybrid source

Existing `recommendations` gain links to findings, agent versions,
cohorts, expected KPI effects, and lifecycle timestamps.

### Aggregate projections

Agent metrics should initially be query-time SQL over normalized metric rows, then move
to daily materialized projections when volume warrants it. Do not persist model-written
agent summaries as the source of truth. Persist the aggregate inputs and insight rule
output; generate narrative text from that bounded structure.

## API contract

Replace the one oversized `/observability` response with route-shaped resources:

```text
GET /observability/overview?from=&to=
GET /observability/agents/:agentId?from=&to=&agentVersionId=
GET /observability/agents/:agentId/compare?baselineVersion=&candidateVersion=
GET /observability/calls/:callId
GET /observability/calls/:callId/runs
GET /observability/calls/:callId/runs/:runId
POST /observability/calls/:callId/reanalyze
```

The overview returns only summary cards, trends, agent rows, and top insights. The call
detail returns transcript annotations and full metric/evidence detail. This avoids
shipping transcripts and large evidence objects on every dashboard load.

## Dashboard information architecture

### 1. Portfolio overview

- period and agent filters plus evaluation-coverage indicator;
- quality, goal success, unresolved-call rate, sentiment recovery, and open critical
  actions, each with delta and sample size;
- quality/outcome trend with call volume;
- agent table: score distribution, trend, goal success, negative-ending rate, top
  recurring issue, prompt version, and confidence state;
- top failure-mode Pareto and action reliability panel;
- prioritized cohort-backed recommendations.

### 2. Agent detail

- agent goal, active prompt version, evidence coverage, and period controls;
- KPI scorecards with trend, pass rate, sample size, and coverage;
- KPI small-multiple trends and score distribution;
- intent mix and outcome-by-intent;
- text-sentiment trajectory aggregate and recovery-by-intent;
- recurring issues ranked by prevalence, severity, and confidence;
- action success and latency by action type;
- prompt-version timeline and before/after comparison;
- recommendation lifecycle and affected calls;
- filterable calls table.

### 3. Call detail

- outcome, overall score, coverage, confidence, intent, resolution, and data quality;
- metric matrix with resolved score plus deterministic and model components side by
  side; disagreements are explicit;
- sentiment trajectory with annotated turning points;
- transcript with metric/finding highlights and exact evidence anchors;
- action timeline with trigger/execution timing;
- findings, missed opportunities, recommendations, and Recommendations;
- analysis-run metadata and a rerun comparison view.

## Calibration and evals

The runtime evaluator itself requires an evaluation system.

1. Curate a versioned golden dataset stratified by agent goal, intent, success/failure,
   safety cases, short calls, and ambiguous calls.
2. Have at least two humans label atomic criteria and evidence spans; adjudicate
   disagreements.
3. Measure binary precision/recall/F1, ordinal agreement, score MAE/rank correlation,
   evidence precision, and human/judge agreement.
4. Test repeated runs and prompt/model changes. A single low-temperature judge call is
   not assumed deterministic.
5. Calibrate per-metric confidence from observed judge/human agreement, evidence
   validity, deterministic/model agreement, and input coverage. Do not treat the
   model's self-reported confidence as a calibrated probability.
6. Promote a new evaluation suite only after it passes regression thresholds on the
   same golden dataset. Run it in shadow before switching production trend charts.

## Implementation sequence

### Phase 1: trustworthy call detail

1. Add agent versions, evaluation suites, multi-run analyses, assessment results,
   metric results, evidence, sentiment observations, and normalized findings.
2. Replace the evaluator output with schema v2 and anchored criteria.
3. Expand deterministic feature extraction and implement the hybrid resolver.
4. Migrate the existing call into a v2 analysis run without deleting its v1 history.
5. Build the call-detail endpoint and route.

### Phase 2: agent insights

1. Build agent aggregates and confidence/coverage calculations.
2. Add recurring insight rules and cohort-backed recommendation generation.
3. Build agent detail with KPI, sentiment, intent, failure-mode, and action panels.

### Phase 3: change comparison and overview

1. Associate calls with prompt versions and build before/after comparison.
2. Add recommendation deployment/measurement lifecycle.
3. Replace the current overview with trend-aware portfolio metrics.
4. Add golden-set evaluation and shadow-run promotion gates.

## Explicit non-goals for the first overhaul

- claiming vocal emotion without audio;
- fabricating response latency or interruption metrics without timestamps;
- cross-agent leaderboards for agents with different goals;
- statistically significant claims from one or two calls;
- automatic prompt mutation without human approval;
- mixing results from different evaluator versions in one unlabeled trend.
