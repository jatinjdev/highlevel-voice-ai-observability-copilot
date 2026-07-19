# Voice AI Observability

This context describes how completed Voice Agent calls are assessed, aggregated, and
turned into concrete operational interventions and manual HighLevel guidance.

## Language

**Voice Agent**:
A HighLevel agent whose completed calls share configuration and Success Criteria.
_Avoid_: Bot, assistant, agent record

**Agent Configuration Snapshot**:
An immutable statement of what was known, unknown, or known empty about a Voice Agent
when a Call was evaluated.
_Avoid_: Current settings, live configuration

**Success Criterion**:
An agent-owned rule describing an observable expectation for a Call. It has immutable
versions and must be active before it affects evaluation.
_Avoid_: Metric, KPI, prompt line

**Criterion Result**:
The categorical, evidence-backed outcome of applying one Success-Criterion version to one
Call Analysis.
_Avoid_: Score, metric value, grade

**Call Analysis**:
An immutable evaluation run for one Call using one Agent Configuration Snapshot and one
Criterion Set.
_Avoid_: Evaluation Result, latest analysis blob

**Agent Analysis**:
A reproducible aggregation of current Call Analyses under one Voice Agent for a defined
cohort and cutoff.
_Avoid_: Dashboard calculation, agent score

**Check**:
The UI presentation of a Criterion Result in the call checklist.
_Avoid_: Metric, KPI, scored criterion

**Finding**:
An evidence-backed explanation of what happened in a Call and why it matters.
_Avoid_: Recommendation, flag

**Evidence Citation**:
A validated quote anchored to an immutable Call turn.
_Avoid_: Transcript timestamp, free-form evidence JSON

**Agent Insight**:
An evidence-backed single observation or repeated pattern produced by an Agent Analysis
and linked to its contributing calls.
_Avoid_: Trend without cohort, dashboard card

**Recommendation Target**:
A real HighLevel setting from the versioned capability catalogue that may be suggested as
a manual change when its evidence policy is satisfied.
_Avoid_: Invented setting, API field

**Recommendation**:
Evidence-backed advisory guidance for manually changing one Recommendation Target in
HighLevel. It never applies the change.
_Avoid_: Automatic fix, API mutation, generic advice

**Call Action**:
A HighLevel capability configured on a Voice Agent, such as transfer, appointment booking,
workflow, SMS, contact update, or a custom/MCP action. It may be the target of a
Recommendation, but is not itself an observability task or queue item.
_Avoid_: Follow-up task, recommendation status
