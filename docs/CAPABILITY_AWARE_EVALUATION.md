# Capability-aware Voice AI evaluation

> Historical research record, superseded for implementation by ADR 0007. The current evaluator is
> checklist-only and sees no agent configuration. The current recommendation surface produces only
> manually requested, paste-ready prompt additions.

## Decision

The evaluator must never infer the current value of an agent setting from a transcript.
Every check is gated by an immutable snapshot of what is actually known for that agent
version. Recommendation targets come from a separately versioned capability catalogue:
either a documented public API field or a real setting documented in HighLevel's current
editor.

The pipeline distinguishes four states:

- **applicable and observable**: evaluate and include in scoring;
- **applicable but not observable**: report a data gap, never a failure;
- **not applicable**: exclude from the denominator;
- **documented manual target**: show evidence-backed guidance for a real editor setting,
  but do not claim its current value or offer automatic application;
- **unsupported target**: suppress the recommendation entirely because HighLevel does
  not document or expose such a control.

`unknown` is not interchangeable with `false`, `none`, or an empty collection.

## HighLevel capability audit

Sources:

- [Get Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/get-agent/)
- [Voice AI OAuth scopes](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html)
- [Get Agent Action](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/get-action/)
- [Voice AI editor capabilities](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents)
- [Voice AI knowledge-base integration](https://help.gohighlevel.com/support/solutions/articles/155000005266-knowledge-base-integration-for-voice-ai-agents)

The live OAuth response was inspected on 2026-07-16. It contained the fields below.
This is stronger evidence than assuming that every editor field is exposed publicly,
but it remains a point-in-time capability snapshot.

| Configuration                                                      | Public read path                                              | Current installation                                 | Recommendation policy                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Prompt, greeting, language, voice                                  | `GET /voice-ai/agents/:agentId`                               | Readable                                             | May propose an exact prompt/greeting diff                                                                          |
| Responsiveness, maximum duration, idle reminders                   | Agent response                                                | Readable                                             | Recommend only when call/cohort evidence directly matches the control                                              |
| Working hours, timezone, backup behavior                           | Agent response                                                | Readable                                             | Operational checks only; not generic call-quality checks                                                           |
| Translation                                                        | Agent response                                                | Readable                                             | Evaluate only when enabled or when the desired language is explicitly configured                                   |
| Post-call workflow IDs and notifications                           | Agent response                                                | Readable                                             | Check configured outcomes against post-call evidence when observable                                               |
| During-call actions                                                | Agent `actions` field, then `GET /voice-ai/actions/:actionId` | Agent field readable; action-detail scope is missing | Do not flag action selection until `voice-ai-agent-goals.readonly` is authorized and action details are resolved   |
| Knowledge-base inventory                                           | Generic Knowledge Base APIs                                   | Not integrated                                       | Inventory alone cannot prove which KB is attached to an agent                                                      |
| Attached KB and its trigger prompt                                 | Present in the editor                                         | Not returned by the live Agent API response          | May recommend manual setup or inspection; diagnose the current attachment only when supplied or otherwise observed |
| LLM/model and temperature                                          | Present in the editor                                         | Not returned                                         | Advanced manual experiment only after prompt, knowledge, and action causes have been ruled out                     |
| Keyword boosting and advanced transcription                        | Present in the editor's advanced settings                     | Not returned                                         | Manual recommendation with reviewed audio or trusted ground truth; never from transcript text alone                |
| Hold phrases, wait-before-speaking, detailed speech/voice settings | Present in the editor                                         | Not returned                                         | Manual recommendation only with audio/timing evidence; never claim the unknown current value                       |
| Executed call actions                                              | Call-log payload                                              | Readable when present                                | Compare IDs/results to configured actions; do not invent a latency SLO                                             |
| Audio and word/action timeline                                     | Not present in the current call-log evidence                  | Unavailable                                          | Do not make acoustic, interruption, pronunciation, or timing claims                                                |

The app currently has `voice-ai-dashboard.readonly` and
`voice-ai-agents.readonly`. Add `voice-ai-agent-goals.readonly` and reauthorize the
installation before evaluating configured during-call actions. Write scopes are not
required for analysis; they are required only if the product later applies an approved
change.

## Agent capability snapshot

Persist a new snapshot whenever any readable agent configuration changes. A call
analysis references exactly one snapshot, so historical analyses do not silently change
when the live agent changes.

```ts
interface AgentCapabilitySnapshot {
  agentId: string;
  locationId: string;
  capturedAt: string;
  sourceHash: string;

  config: {
    prompt: Known<string>;
    greeting: Known<string>;
    voiceId: Known<string>;
    language: Known<string>;
    responsiveness: Known<number>;
    maxCallDurationSeconds: Known<number>;
    idleReminders: Known<{ enabled: boolean; afterSeconds: number | null }>;
    workingHours: Known<unknown[]>;
    timezone: Known<string>;
    translation: Known<{ enabled: boolean; language: string | null }>;
    postCallWorkflowIds: Known<string[]>;
    actions: Known<ConfiguredAction[]>;

    knowledgeBase: UnknownOrKnown<{
      id: string;
      triggerPrompt: string;
      contentVersion: string;
    }>;
    model: UnknownOrKnown<string>;
    temperature: UnknownOrKnown<number>;
    transcription: UnknownOrKnown<TranscriptionConfiguration>;
    speech: UnknownOrKnown<SpeechConfiguration>;
  };

  authorization: {
    grantedScopes: string[];
    missingScopes: string[];
  };
}

type Known<T> = { state: 'known'; value: T; source: 'highlevel_api' | 'user' };
type UnknownOrKnown<T> = Known<T> | { state: 'unknown'; reason: string };
```

User-supplied settings are allowed as a temporary supplement, but the UI must label
their source and last verification time. They must never masquerade as synchronized
HighLevel data.

## Check hierarchy

### 1. Universal conversation checks

These apply to every agent with a usable, speaker-labelled transcript. They are
semantic judgments with quoted evidence, not keyword heuristics.

- **Customer outcome:** was the caller's actual request resolved, advanced, or clearly
  handed off?
- **Problematic agent behavior:** unsafe, deceptive, discriminatory, hostile, or
  unsupported claims; fabricated facts; inappropriate certainty.
- **Agent-caused frustration:** did sentiment worsen immediately after the agent ignored,
  contradicted, repeated, or mishandled the caller? Negative sentiment alone is not an
  agent failure.
- **Sentiment trajectory and recovery:** opening, minimum, closing, turning points, and
  whether the agent recovered after a negative turn. Text sentiment is not vocal emotion.
- **Listening and context retention:** did the caller have to restate information because
  it was ignored, or did the agent contradict established facts?
- **Relevance and clarity:** did responses address the current request without confusing,
  repetitive, or needlessly long content?
- **Appropriate empathy:** was acknowledgement proportional to the caller's situation,
  without penalizing routine transactional calls for neutral tone?
- **Grounding and uncertainty:** did the agent distinguish known facts from uncertainty
  and avoid hallucinating business information?
- **Escalation judgment:** when resolution was impossible or risk was high, did the agent
  set an appropriate next step? This does not assume that a transfer action exists.

These checks are evaluated per call and aggregated by agent, intent, and agent snapshot.
One conclusive call can create a call-level recommendation. Agent-level presentation must
state whether an issue occurred once or formed a repeated pattern; it must not disguise a
single observation as a trend.

### 2. Configuration-derived checks

These are compiled only from known configuration.

#### Prompt and script

Extract explicit obligations, conditional branches, required data, forbidden behavior,
success criteria, and end conditions from the versioned prompt. Each obligation becomes
a proposed check with a quote from its source prompt. Examples include collecting a
phone number before promising follow-up or confirming an appointment before ending.

The compiler must distinguish instructions from illustrative examples and mark ambiguous
obligations as drafts for user approval.

#### Actions

An action check is applicable only when its configuration and trigger are readable.

- If the configured trigger occurred, was the correct action attempted?
- Did the executed action ID and result match the configured action?
- Did the agent recover or explain the next step if execution failed?
- Was an action invoked without its configured precondition?

No configured action means no action-execution check. Adding a new action may still be a
recommendation when a call conclusively establishes an operational need and that action
type actually exists in HighLevel. Repetition strengthens agent-level priority but is not
a hard eligibility gate.

#### Knowledge base

Only evaluate KB use when the attached KB, trigger prompt, and content version are known.
Then check whether the trigger condition occurred, whether retrieval was appropriate,
and whether the answer was supported by the KB. A missing relationship is a data gap,
not a failed KB check.

#### Transcription and speech

A transcript alone cannot prove that a proper name was transcribed incorrectly. A
keyword-boosting recommendation needs all of the following:

1. known ground truth from a contact field, user label, or reviewed audio;
2. a conclusive error in one reviewed call, with repetition preferred when available;
3. a known, configurable keyword-boosting control;
4. no stronger competing explanation;
5. a validation set to test the change.

Hold phrases, interruption handling, latency, pronunciation, and prosody require audio,
timestamps, or known settings. They are not evaluated from the current evidence.

#### Advanced behavioral settings

Maximum duration, idle reminders, responsiveness, model, or temperature are low-priority
causal hypotheses. Prefer a repeated pattern and a controlled comparison. One call may
still justify inspection when evidence is conclusive, such as a call ending exactly at
the configured duration, but never infer a temperature change from one transcript.

### 3. User-defined checks

Users can describe a rule in natural language. The model compiles it into a typed draft;
the user sees and approves the operational definition before it can create Recommendations.

```ts
interface CheckDefinition {
  id: string;
  version: number;
  agentId: string | null;
  origin: 'universal' | 'prompt_generated' | 'user_defined' | 'configuration';
  title: string;
  statement: string;
  applicability: ApplicabilityPredicate;
  requiredEvidence: EvidenceRequirement[];
  assessor: 'semantic' | 'fact_verifier' | 'hybrid';
  statuses: Array<'clear' | 'review' | 'critical' | 'not_applicable' | 'not_observable'>;
  severity: 'normal' | 'critical';
  recommendationTargets: RecommendationTarget[];
  sourceReferences: SourceReference[];
  status: 'draft' | 'active' | 'retired';
}
```

The compiler rejects or leaves as `not_observable` any rule whose required evidence is
unavailable. Example: "The agent must sound warm" cannot be evaluated from a transcript
without audio. "Never state a price that is absent from the configured knowledge base"
cannot run while the attached KB is unknown.

Recommended checks generated from the prompt follow the same draft/approval path. The UI
shows the source prompt clause, evidence requirement, review conditions, and calls on
which the check would have been applicable.

## Role of deterministic code

Deterministic code is a fact-verification and aggregation layer, not a substitute for
conversation judgment. It should:

- validate transcript evidence quotes and speaker labels;
- calculate evidence availability;
- compare configured and executed action IDs/results;
- verify extracted required fields where their source and meaning are known;
- evaluate explicit machine-readable predicates;
- aggregate repeated semantic outcomes by agent/configuration version;
- keep `not_applicable` and `not_observable` results out of the intervention queue.

Remove generic ten-second termination, word-share, exact-duplicate, and action-latency
quality judgments. Those values can remain as diagnostics if needed, but they do
not establish quality without context or a configured service objective.

## Recommendation policy

Every displayed recommendation must identify an exact supported target:

```ts
interface RecommendationTarget {
  path: string;
  support: 'live_api' | 'documented_api' | 'documented_highlevel_ui' | 'user_supplied';
  execution: 'api_write' | 'manual_highlevel_ui';
  evidencePolicy: 'single_call_can_suffice' | 'pattern_preferred';
  verificationPlan: string;
  rollbackPlan: string;
}
```

Priority order:

1. safety, deception, severe customer harm, and necessary human intervention;
2. exact prompt or greeting correction supported by quoted failures;
3. correction to an existing, readable action trigger or configuration;
4. addition of a documented HighLevel action for an evidenced operational need;
5. knowledge-base creation, attachment, content, source, or trigger guidance;
6. post-call, language, translation, routing, and reporting configuration;
7. transcription/speech changes with audio or trusted ground truth;
8. responsiveness, model, temperature, audio, or system-prompt experiments after simpler
   causes have been ruled out.

If a target exists in first-party editor documentation but its current value is unknown,
the recommendation must be phrased as a manual inspection or proposed capability, not as
a claim that the setting is wrong. Suppress only invented or unverified targets. A
separate "data needed" panel may explain what would turn the proposal into a diagnosis.

## Implementation sequence

1. Add immutable agent capability snapshots and preserve unknown states.
2. Authorize action-detail read scope and resolve configured actions.
3. Replace the current quality heuristics with evidence-coverage/fact verification.
4. Add versioned universal check definitions and structured semantic results.
5. Compile prompt obligations into reviewable check drafts.
6. Add natural-language user-check creation, validation, approval, and versioning.
7. Gate recommendations through the supported-target registry.
8. Aggregate only like-for-like calls sharing an agent configuration snapshot, then add
   controlled comparison across snapshots.
9. Re-run the existing call; action, KB, timing, and acoustic checks should be explicitly
   not applicable or not observable rather than silently flagged.
