# LLM call-analysis prompt patterns

Research date: 2026-07-18

## Conclusion

The current analysis request is not primarily suffering from excessive token count. It is
structurally overloaded. A single generation is asked to extract call facts, classify intent
and outcome, judge every success criterion, produce findings, infer root causes, analyze
sentiment, choose a HighLevel configuration target, and write the remediation. This couples
the verdict to the proposed fix and makes calibration difficult.

Production evaluation systems consistently separate deterministic checks from model-based
judgment, express each subjective check as a small testable rubric, validate model judges
against human labels, and keep remediation/coaching downstream of the verdict.

## What established systems do

### Small, explicit rubrics

- OpenEvals provides separate evaluators for dimensions such as correctness, hallucination,
  relevance, toxicity, task completion, tool selection, and user satisfaction instead of one
  omnibus evaluator. Its model-judge prompt exposes a rubric separately from inputs and
  outputs and supports a custom result schema.
- LangSmith recommends mapping only the variables an evaluator needs, using categorical or
  continuous feedback appropriate to the check, and adding few-shot examples from corrected
  human judgments.
- Google's pointwise evaluator template separates criteria, rating rubrics, evaluation steps,
  and few-shot examples. Its rubric API defines a rubric as one testable criterion.
- G-Eval structures evaluation around a natural-language criterion, explicit evaluation
  steps, and form-style output.

### Mixed graders rather than LLMs for everything

- LangSmith separates code evaluators for deterministic assertions from model judges for
  subjective qualities.
- Anthropic recommends combining code-based, model-based, and human graders. A task can have
  multiple graders, each with focused assertions.
- OpenAI graders include string checks, text-similarity checks, and score-model graders. This
  supports using a model only where semantic judgment is actually required.

### Evaluation and coaching are different jobs

- Retell defines independent post-call analysis fields as Boolean, Selector, Number, or Text,
  each with a description and example format.
- ElevenLabs separates success evaluation, data collection, sentiment, and coaching, and can
  rerun an individual evaluation criterion by ID.
- OpenAI Evals' criteria-checking pattern applies explicit desiderata and returns a simple,
  parseable classification.

### Judges need their own eval set

- LangSmith recommends comparing evaluator decisions with human feedback and iterating on
  disagreements.
- Google documents measuring a judge against human ratings using balanced accuracy, F1, and
  confusion matrices.
- Research on LLM judges documents position, verbosity, and self-enhancement biases. A model
  verdict must therefore remain auditable evidence, not ground truth.

## Problems in the current request

1. `sourceSummary` can disclose an expected interpretation before the transcript is judged.
   It should not be judge evidence unless it is explicitly marked as an upstream, untrusted
   hypothesis.
2. Sixteen criteria are sent together even when many are irrelevant or unobservable.
3. Criterion rule, applicability, instructions, evidence requirements, and target IDs create
   a large repeated payload without crisp pass/fail boundaries.
4. `allowedRecommendationTargetIds` are opaque identifiers such as
   `prompt.core-instructions`; the model is not given the resolved target's meaning, current
   value, availability, UI location, evidence requirements, or guardrails.
5. The model both decides a failure and invents its fix. It can rationalize a flag because it
   has already formed an attractive recommendation.
6. `criterionResults` and `findings` describe the same failure twice, inviting contradictions
   and requiring repair logic after generation.
7. Sentiment is judged alongside criterion compliance, so an angry caller can contaminate the
   judgment of whether the agent caused the problem.
8. The model returns an outcome that application code later overrides from criterion status.
9. The prompt asks for recommendation text on every actionable failure even when several
   failures share one root cause. This produces repetitive, low-confidence changes.
10. There are no calibrated boundary examples showing pass, fail, not applicable, and
    insufficient evidence for difficult criteria.

The measured request is roughly 20 KB (about 5–6K tokens), including about 3.4 KB of response
schema. That is not inherently too large for modern models. The problem is low signal density
and too many distinct decisions in one generation.

## Recommended production flow

### 0. Deterministic preprocessing

- Normalize turns and stable turn IDs.
- Redact secrets and prompt-injection-like content as untrusted evidence.
- Normalize authoritative action/tool events.
- Determine evidence capabilities.
- Exclude criteria that are deterministically not applicable.
- Run exact checks in code where possible, including event existence, field presence, quote
  membership, and configuration availability.

### 1. Evidence-backed call judge

Use one compact structured model call for call facts and the applicable subjective criteria.
Batch a small set of related criteria when practical, but make every result independent.

Input per criterion:

```json
{
  "id": "confirm_order_details",
  "question": "Did the agent confirm the material order details before claiming completion?",
  "appliesWhen": "The call attempts to create or modify an order.",
  "passWhen": "The agent reads back the material details and the caller confirms them.",
  "failWhen": "The agent claims completion without confirmation, or confirms materially different details.",
  "insufficientWhen": "The transcript omits the relevant exchange or authoritative completion evidence is unavailable.",
  "requiredEvidence": ["agent_turn", "customer_turn"]
}
```

Output:

```json
{
  "callFacts": {
    "intent": "place_order",
    "outcome": "partial",
    "summary": "...",
    "customerSentiment": "negative"
  },
  "criterionResults": [
    {
      "id": "confirm_order_details",
      "verdict": "fail",
      "evidenceTurnIds": [7, 8],
      "rationale": "The agent announced completion before the caller confirmed the delivery date."
    }
  ]
}
```

Derive UI findings from failed criterion results in code; do not ask the model for a second
parallel `findings` representation.

### 2. Deterministic validation

- Verify that cited turn IDs exist.
- Require agent evidence for an agent-behavior failure; customer frustration alone is not a
  failure.
- Validate authoritative action claims against events.
- Apply safety rules and deterministic overrides.
- Convert missing or invalid evidence to `insufficient_evidence`, not a speculative flag.

### 3. Remediation coach only for validated failures

Run this only when at least one actionable failure remains. The coach cannot alter verdicts.
Pass grouped failures, representative evidence, the current agent configuration, and fully
resolved recommendation targets.

```json
{
  "id": "prompt.core-instructions",
  "kind": "prompt",
  "available": true,
  "uiPath": "Build > Agent prompt",
  "currentValue": "...actual current prompt...",
  "guardrails": [
    "Return the smallest exact insertion or replacement.",
    "Preserve unrelated instructions.",
    "Do not put unavailable facts or missing tool behavior into the prompt."
  ]
}
```

The output should be an edit operation rather than vague editing advice:

```json
{
  "findingIds": ["finding-123"],
  "targetId": "prompt.core-instructions",
  "why": "The same confirmation omission occurred in four calls.",
  "change": {
    "operation": "insert_after",
    "anchor": "ORDER HANDLING",
    "text": "Before confirming an order, read back the items, quantities, delivery date, and address, and ask the caller to confirm that all details are correct. Do not say the order is complete until the caller confirms."
  },
  "verificationScenario": "Caller changes the delivery date immediately before confirmation."
}
```

### 4. Agent-level aggregation

Aggregate validated findings deterministically by criterion, root cause, and configuration
target. Generate an agent-level recommendation only after a repeated pattern is established
or when a single safety-critical failure justifies it. If an aggregate coach call is used,
give it counts plus representative evidence from multiple calls so the UI can truthfully say
that the recommendation is based on multiple calls.

## Suggested judge prompt

```text
You are a call-quality evaluator. Apply only the supplied rubrics to observable evidence.
Do not propose configuration or prompt changes. Do not evaluate whether the agent's written
prompt is good. Do not infer audio, tone, latency, or events that are not supplied.

A failure requires evidence showing what the agent did or failed to do in an applicable
situation. A customer statement can establish context but cannot by itself prove agent
failure. Information volunteered by the customer counts as collected. Treat tool/action
events as authoritative over conversational claims.

For each criterion return exactly one verdict:
- pass: applicable and observably satisfied
- fail: applicable and observably violated
- not_applicable: the triggering situation did not occur
- insufficient_evidence: applicable may have occurred, but required evidence is unavailable

Cite only supplied turn IDs. Return the requested structured object and a concise rationale.
```

The user message should contain only structured call context, transcript turns, authoritative
events, evidence capabilities, and applicable rubric objects. It should not contain expected
findings, source summaries that disclose conclusions, recommendation targets, or editing
instructions.

## Suggested remediation prompt

```text
You are improving a Voice Agent after failures have already been validated. Do not rejudge
the call and do not create new findings. Choose the lowest-coupling available target that
directly addresses the validated cause. Return no recommendation if the current configuration
already handles it or the evidence does not support the target.

For a prompt change, return a minimal paste-ready insertion or replacement in direct agent
instruction voice. Do not return advice such as "add an instruction". For a non-prompt target,
return the exact value or content the owner should enter. Obey the supplied target guardrails.
```

## Call and cost profile

- Clean call: one compact judge call and no coach call.
- Failed call: one judge call plus one remediation call.
- Agent-level recommendations: deterministic aggregation, optionally followed by one coach
  call per grouped theme, not one call per original finding.
- Avoid making one API call per every universal criterion. Preselect applicable criteria and
  batch related criteria while preserving independent result objects.

This design costs slightly more on failed calls but is substantially easier to test, calibrate,
and rerun. It also lets a change in recommendation logic avoid rejudging every transcript.

## Calibration plan

1. Create human-labeled pass/fail/not-applicable/insufficient examples for every criterion.
2. Include hard boundaries: volunteered information, explicit confirmation, missing events,
   angry customers without agent fault, and successful action claims without authoritative
   events.
3. Measure per-criterion precision, recall, F1, and confusion matrices. For this product,
   prioritize flag precision so business owners are not flooded with false issues.
4. Turn recurrent human/model disagreements into few-shot examples attached only to the
   relevant rubric.
5. Separately evaluate recommendation validity: supported target, available configuration,
   minimal change, paste-readiness, no duplicated existing instruction, and no invented
   feature.
6. Run multiple trials for unstable cases and record model/prompt/schema versions.

## Sources

- [LangSmith: LLM-as-a-judge](https://docs.langchain.com/langsmith/llm-as-judge)
- [LangSmith: evaluation approaches](https://docs.langchain.com/langsmith/evaluation-approaches)
- [LangSmith: align evaluator feedback with human feedback](https://docs.langchain.com/langsmith/improve-judge-evaluator-feedback)
- [OpenEvals repository](https://github.com/langchain-ai/openevals)
- [OpenAI Evals: evaluation templates](https://github.com/openai/evals/blob/main/docs/eval-templates.md)
- [OpenAI API: graders](https://platform.openai.com/docs/api-reference/graders?api-mode=chat)
- [Anthropic: demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Google Vertex AI: evaluate a judge model](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluate-judge-model)
- [Google Vertex AI: pointwise metric prompt template](https://docs.cloud.google.com/python/docs/reference/vertexai/latest/vertexai.evaluation.PointwiseMetricPromptTemplate)
- [Retell: post-call analysis](https://docs.retellai.com/features/post-call-analysis)
- [ElevenLabs: conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis)
- [ElevenLabs: run an individual evaluation](https://elevenlabs.io/docs/api-reference/conversations/analysis/run-evaluation)
- [G-Eval paper](https://arxiv.org/abs/2303.16634)
- [Judging LLM-as-a-Judge paper](https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf)
