# Voice-provider post-call analysis patterns

Research date: 2026-07-18

## Conclusion

ElevenLabs, Retell, Vapi, and Twilio converge on a useful product architecture even though
their APIs differ:

1. A completed call produces a durable transcript/artifact.
2. Analysis is asynchronous and attached to that call.
3. Summary, structured extraction, sentiment, and success evaluation are distinct concerns.
4. User-defined checks have typed, independently identifiable outputs.
5. Ambiguous or missing evidence is represented explicitly rather than forced into failure.
6. Analysis can be rerun after criteria change.
7. Coaching is downstream from evaluation and is presented as a proposed configuration
   change, not mixed into the verdict.

Our HighLevel application should use these providers as design references, not runtime
dependencies. HighLevel remains the source of calls and agent configuration; our system owns
the normalized evidence, criteria, evaluator runs, findings, and recommendations.

## ElevenLabs

### Data and execution model

ElevenLabs explicitly separates five analysis capabilities: success evaluation, data
collection, sentiment analysis, coaching, and conversation search. It describes them as
complementary capabilities rather than one universal analysis result.
([Conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis))

Its post-call transcription webhook contains the full transcript, metadata, and an `analysis`
object. Transcript turns include the role, message, time in call, tool calls, tool results, and
turn metrics. The call also carries `agent_id`, `conversation_id`, and the `version_id` of the
agent configuration active during the call. ElevenLabs validates delivery with an HMAC
signature and expects a successful HTTP response.
([Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks))

This is a strong precedent for storing the configuration version used by the call, rather
than analyzing every historical call against only the agent's current prompt.

### Criteria and extraction

Each ElevenLabs success criterion has its own identifier and natural-language description.
It is independently evaluated against the transcript and returns `success`, `failure`, or
`unknown`, plus a rationale. ElevenLabs recommends defining success and failure explicitly,
including edge cases and examples, and testing the criterion on varied scenarios.
([Success evaluation](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/success-evaluation))

Data collection is configured separately. Each field has an identifier, a primitive data
type (`string`, `boolean`, `integer`, or `number`), and extraction instructions. Missing or
ambiguous values become null or empty rather than speculative values. ElevenLabs recommends
specifying output format, missing-data behavior, examples, and validation requirements.
([Data collection](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/data-collection))

ElevenLabs can rerun one criterion on one conversation by `evaluation_id`. That is an
important lifecycle property: changing one rubric should not require recomputing unrelated
criteria.
([Run conversation evaluation](https://elevenlabs.io/docs/api-reference/conversations/analysis/run-evaluation))

### Analysis versus coaching

ElevenLabs' coach is a separate agent focused on improving the customer-facing agent. It can
read the prompt, memories, and procedures, but it does not silently apply changes. It creates
a proposal containing a rationale and exact diff; the owner approves or rejects it.
([Coaching](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/coaching))

This is the closest product analogue to our intended recommendation UI: validated findings
first, then a paste-ready proposed change with evidence and no automatic mutation.

## Retell AI

### Typed post-call fields

Retell exposes built-in analysis fields and user-defined categories. Custom categories are
one of four types:

- Boolean for yes/no decisions.
- Selector for a fixed set of categories.
- Number for measurements.
- Text for summaries or open-ended extraction.

Each category has a name, description, and, where appropriate, format example or selector
choices. Retell explicitly does not populate custom fields when a call did not connect or no
conversation occurred.
([Post-call analysis overview](https://docs.retellai.com/features/post-call-analysis-overview),
[defining fields](https://docs.retellai.com/features/post-call-analysis-create))

After analysis, Retell exposes a `call_analysis` object containing summary, sentiment,
success, and `custom_analysis_data`. The completed result is available in the dashboard, via
the Get Call API, or in a separate `call_analyzed` webhook event.
([Consuming analysis data](https://docs.retellai.com/features/post-call-analysis-consumption),
[Get Call](https://docs.retellai.com/api-references/get-call))

Retell also keeps summary, successful-call evaluation, and user-sentiment prompts as
separate agent configuration. Its API exposes an analysis model and distinct prompt fields,
including a success prompt with a 2,000-character limit.
([Create Voice Agent](https://docs.retellai.com/api-references/create-agent))

### Reruns and version semantics

Retell supports rerunning an individual call and batch backfilling filtered call history.
Reruns use the latest draft agent's analysis prompts even if the original call used an older
published version, and they incur analysis cost. This is useful behavior, but it also shows
why our records must preserve both:

- the configuration version used during the original call; and
- the evaluator/criteria version used for a particular reanalysis run.

Without both, a changed result cannot be explained.
([Rerun post-call analysis](https://docs.retellai.com/features/rerun-call-analysis))

## Vapi

### Separate analysis outputs

Vapi's `analysisPlan` treats summary, structured extraction, and call-success evaluation as
separate properties. Structured data is governed by JSON Schema, while success evaluation
has its own prompt and output. Results are attached asynchronously to the call record.
([Call analysis](https://docs.vapi.ai/assistants/call-analysis))

Vapi's newer structured outputs process the complete transcript, message history, tool
results, and assistant context after the call, validate the generated result against a JSON
schema, and expose it through call artifacts or webhooks.
([Structured outputs](https://docs.vapi.ai/assistants/structured-outputs-quickstart/))

The Vapi end-of-call report distinguishes the call lifecycle from its artifacts: it contains
the ended reason, call object, recording, transcript, and role-tagged messages. That reinforces
the need to persist raw evidence independently of any analysis run.
([Server events](https://docs.vapi.ai/server-url/events))

### Testing patterns

Vapi Evals uses mock conversations and supports exact matching, regex, tool-call validation,
and AI judges. Its guidance is to keep one behavior per evaluation turn, use binary and
specific judge prompts, test both happy paths and edge cases, inspect failure reasons, and
version-control evaluations with agent configuration.
([Evals quickstart](https://docs.vapi.ai/observability/evals-quickstart))

Its simulations complement production post-call analysis: simulations exercise complete
conversation behavior, while evals provide faster controlled validation. This maps directly
to our planned fake-agent transcript corpus and later voice-call testing.
([Simulations quickstart](https://docs.vapi.ai/observability/simulations-quickstart))

## Twilio Conversation Intelligence

Twilio models analysis as reusable language operators attached to a transcript service.
Prebuilt operators cover sentiment and summarization; custom operators cover business-specific
classification, phrase matching, extraction, and generative JSON. Transcript sentences,
recording media, and operator results are separate subresources.
([Language operators](https://www.twilio.com/docs/conversation-intelligence-classic/language-operators),
[Transcript resource](https://www.twilio.com/docs/conversation-intelligence-classic/api/transcript-resource))

Generative custom operators support a prompt, a JSON output schema, and optional input/output
training examples. Twilio provides a preview workflow that applies a draft operator to an
existing representative transcript before activation.
([Generative custom operators](https://www.twilio.com/docs/conversation-intelligence-classic/generative-custom-operators))

The useful architectural pattern is modular operators: one transcript can accumulate many
independent, versionable results rather than one monolithic analysis blob.

## Provider pattern mapped to our HighLevel app

| Provider pattern | Our implementation |
| --- | --- |
| Durable call and transcript artifact | `Call` plus immutable normalized transcript turns and authoritative action events |
| Agent/version identity on each call | Store HighLevel agent ID and configuration snapshot/version used by the analysis |
| Separate summary, extraction, sentiment, criteria | Independent result records under one analysis run; never one opaque response blob |
| Typed custom fields | Criteria and extractions have stable IDs, result types, nullable behavior, and versioned definitions |
| `unknown` or missing output | Use `insufficient_evidence` and `not_applicable`; do not convert missing evidence into failure |
| Criterion-specific rerun | Queue selected criterion IDs for selected call IDs and reuse unchanged results |
| Batch backfill | Rerun last 24 hours/7 days or filtered calls against a chosen criteria version |
| Separate coach and diff proposal | Generate recommendations only from validated findings; store exact paste-ready change separately |
| Tool results in analysis context | Treat actual HighLevel call actions/events as authoritative over what the agent claims in speech |
| Test transcript preview | Run every rubric and recommendation prompt against a labelled transcript suite before promotion |

## Recommended analysis contract

### 1. Canonical evidence

Normalize HighLevel data into a provider-neutral call artifact:

```json
{
  "callId": "call-123",
  "agentId": "agent-456",
  "configurationSnapshotId": "snapshot-789",
  "startedAt": "...",
  "endedReason": "...",
  "turns": [
    { "id": "t1", "role": "agent", "text": "...", "offsetMs": 0 }
  ],
  "events": [
    { "id": "e1", "type": "action.completed", "action": "book_appointment" }
  ],
  "evidenceCapabilities": {
    "hasTranscript": true,
    "hasTurnTimestamps": false,
    "hasActionEvents": true,
    "hasAudio": false
  }
}
```

### 2. Independent analysis products

Run and persist these independently:

- **Call facts:** concise summary, primary intent, observable outcome.
- **Structured extraction:** user-defined typed fields with null for absent evidence.
- **Customer sentiment:** customer sentiment only, not a proxy for agent failure.
- **Criterion evaluations:** one result per criterion with pass/fail/not-applicable/
  insufficient-evidence, rationale, and evidence turn IDs.
- **Deterministic assertions:** event existence, action result, data presence, transcript quote
  validation, and configuration availability.

The application should derive visible flagged issues from validated failed criteria; the
model should not generate a second competing findings collection.

### 3. Version every evaluation

Every result must record:

- call evidence version;
- configuration snapshot ID;
- criterion ID and criterion version;
- evaluator prompt/schema version;
- model/provider version;
- run ID, timestamps, and reason (`initial`, `manual`, `criteria_changed`, `backfill`);
- evidence references and validation status.

This allows selective reruns and fair comparisons after a prompt or rubric changes.

### 4. Coach only validated failures

The recommendation stage consumes findings that have already passed evidence validation,
plus the exact current HighLevel configuration and a resolved catalogue of actually available
settings. It cannot change the verdict. For prompt recommendations it returns a minimal,
paste-ready insertion or replacement; for another setting it returns the exact content/value
and the HighLevel UI path. Recommendations are proposals only.

### 5. Agent-level analysis

Aggregate criterion results and findings in code first. An agent-level coach call should
receive a repeated theme, affected-call count, and representative evidence from multiple
calls. A single safety-critical call can still produce an agent-level proposal, but ordinary
configuration changes should be backed by a repeated pattern. Preserve the contributing call
and finding IDs so the dashboard can show why the aggregate recommendation exists.

## What not to copy

- Do not call ElevenLabs or Retell to analyze HighLevel transcripts. That adds another
  platform dependency without improving our evidence model.
- Do not infer the call objective solely from the current agent prompt, as Vapi's default
  success evaluator does; explicit user criteria and the call-time configuration are stronger.
- Do not copy Retell's latest-draft-only rerun semantics without preserving the original
  configuration and evaluator versions.
- Do not collapse all outputs into one generative JSON operator. Typed, independently
  rerunnable criteria are easier to calibrate and cheaper to reprocess.
- Do not automatically apply coaching changes. ElevenLabs' proposal/diff/approval model is
  the safer reference, even though our assignment only requires recommendations.

## Practical first implementation

1. Keep HighLevel webhook ingestion and historical sync unchanged as evidence sources.
2. Introduce immutable call artifacts and configuration snapshots.
3. Replace the omnibus call-analysis request with a call-facts result plus independent
   criterion results.
4. Add criterion-level rerun jobs and evaluator-version keys to idempotency.
5. Validate evidence and action claims deterministically.
6. Generate recommendations in a separate coach stage only for validated failures.
7. Aggregate agent-level themes from stored call-level results, then coach each theme once.
8. Calibrate every criterion against labelled happy-path, failure, ambiguous, adversarial,
   missing-event, and incomplete-transcript examples before using it in production.
