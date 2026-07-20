# Voice AI Observability

This context defines the product language for evaluating completed Voice Agent calls and turning
repeated failures into optional prompt guidance.

## Language

**Voice Agent**:
A HighLevel Voice AI agent. Its calls share one current prompt and an agent-owned Success Criteria
checklist.
_Avoid_: Bot, assistant, agent record

**Current Agent Configuration**:
The latest Voice Agent prompt and configuration returned by HighLevel. It is used only when a user
requests prompt guidance; it is never treated as the configuration that handled a historical Call.
_Avoid_: Configuration snapshot, prompt version, historical configuration

**Success Criterion**:
A named checklist item owned by one Voice Agent. Its immutable, unique name is the aggregation key;
its editable description is the complete instruction evaluated by the model.
_Avoid_: Weighted metric, KPI score, criterion version, criterion set

**Call Evidence**:
The transcript turns and executed Call Action events observed for one completed Call. Call Analysis
may use nothing else.
_Avoid_: Current agent prompt, hidden configuration, inferred action execution

**Criterion Result**:
The categorical result of applying one Success Criterion to one Call: `pass`, `fail`,
`not_applicable`, or `unknown`. A failure must cite Call Evidence.
_Avoid_: Score, grade, weighted result

**Call Analysis**:
One checklist evaluation of a completed Call against the Voice Agent's current Success Criteria,
plus an informational Call Overview containing intent, outcome, and customer sentiment. The overview
does not influence Criterion Results or generate recommendations.
_Avoid_: Prompt review, root-cause analysis, call recommendation

**Agent Analysis**:
A read model that groups the current Criterion Results from multiple Calls by Success Criterion.
It is not a separate model judgment and has no overall score.
_Avoid_: Fleet score, hidden aggregate evaluation

**Prompt Recommendation**:
User-requested guidance for one failed Success Criterion. Generation samples up to the 20 most
recent failed Calls, compares those failures with the Current Agent Configuration, and returns a
paste-ready prompt addition only when the prompt does not already address the concern.
_Avoid_: Automatic recommendation, call-level recommendation, applied fix, recommendation history

**Call Action**:
A HighLevel capability executed during a Call, such as transfer, appointment booking, workflow,
SMS, contact update, or a custom/MCP action. When HighLevel supplies an execution event, it becomes
Call Evidence; its absence is not proof that an action failed.
_Avoid_: User Action, follow-up task, queue item

## Invariants

- Call Analysis receives Call Evidence and Success Criterion descriptions only.
- Call Overview is descriptive metadata from the same model request and never drives flags,
  adherence, aggregation, or recommendations.
- Success Criterion names are unique within a Voice Agent and are not editable.
- Recommendations exist only at Voice Agent level and one may exist per Success Criterion.
- Recommendations are generated or regenerated only by an explicit user request.
- Deleting a recommendation deletes its generation state; no history is retained.
- A prompt change invalidates every stored recommendation for that Voice Agent.
- A stale model response cannot replace guidance generated for a newer request or prompt.
