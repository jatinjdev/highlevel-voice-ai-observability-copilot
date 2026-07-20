# Four-minute assignment demo

The demo should be recorded inside the HighLevel sandbox so the Marketplace integration is
visible. Keep terminal and AWS details out of the main walkthrough unless they directly prove
the end-to-end path.

## Before recording

- Install the final Marketplace version in the intended Location.
- Sync the existing calls and confirm workers have completed.
- Keep two agents visible, including the intentionally incomplete prompt-remediation agent.
- Ensure at least one call has a failed criterion with transcript evidence.
- Delete one existing recommendation so generation can be demonstrated.
- Keep the Marketplace webhook log in a second tab if showing the live-call path.
- Hide all browser tabs, terminal output, and environment values that could expose secrets.

## 0:00-0:30 - Context and integration

Open **Voice AI Observability Copilot** from the HighLevel Location navigation.

Say:

> This is a private Marketplace app installed in a HighLevel sandbox Location. HighLevel owns
> the navigation and signed user context; the embedded app is authorized only for this Location.
> It monitors existing calls and future `VoiceAiCallEnd` events without a workflow or PIT.

## 0:30-1:00 - Fleet dashboard

Show the agent table and search.

Say:

> The fleet view avoids an arbitrary quality score. It answers which Voice Agent has been
> analyzed and how many criterion failures need attention. I can start with a single call; there
> is no minimum-volume gate.

Open the prompt-remediation agent.

## 1:00-1:45 - Agent observability parameters

Point to the call log and Success Criteria side by side. Select one failed criterion and show the
call list filter.

Say:

> Success Criteria are the observability parameters for this agent. The name is a stable key and
> the description is the complete natural-language check. Universal checks are seeded once, and
> a business owner can add goal- or script-specific checks. Every call is evaluated independently
> as pass, fail, not applicable, or unknown.

Briefly show **Add criterion**, but do not spend time typing unless the evaluator needs to see it.

## 1:45-2:25 - One call and exact evidence

Open a failed call. Click **View evidence** for a failed criterion.

Say:

> Call Analysis is deliberately a checklist, not free-form advice. It receives the transcript,
> executed Call Action evidence, and criterion descriptions - never the agent's current prompt.
> A failure must cite a real stored turn or action. Clicking View evidence takes the reviewer to
> the exact line, so the judgment is auditable.

## 2:25-3:20 - Agent-level recommendation

Return to the agent and click **Generate prompt guidance** for the selected failed criterion.
While it processes, explain the rule; then show the resulting card and copy icon.

Say:

> Recommendations exist only at agent level because one call does not prove the current prompt
> is wrong. On request, the worker samples up to 20 recent failures for this criterion and checks
> the current prompt. If it already covers the concern, no recommendation is created. Otherwise
> this card gives the exact text the user can paste into HighLevel. The app never changes the
> agent automatically.

Copy the prompt addition and show the confirmation.

## 3:20-3:50 - Ingestion and reliability

If a fresh call is already prepared, show it appearing in the table. Otherwise show the
Marketplace webhook log next to the dashboard.

Say:

> New call webhooks are signature-verified and persisted before HighLevel receives a success
> response. Inbox/outbox delivery, SQS, idempotent workers, and PostgreSQL make retries safe.
> Historical sync enters this exact same pipeline, so the dashboard does not have separate demo
> and production analysis paths.

## 3:50-4:10 - Close

Say:

> This closes the validation flywheel from raw call log, to criterion failure, to exact evidence,
> to a current and actionable prompt change. The README distinguishes the fully functional path
> from the test fixture and the few production increments I intentionally left explicit.

End on the agent page with calls, Success Criteria, and recommendation visible together.
