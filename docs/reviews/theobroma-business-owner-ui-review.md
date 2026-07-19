# Theobroma Bakery · Customer Care — business-owner UI review

## Review scope

I reviewed this as the owner-operator of Theobroma: I want to know whether customers are being served properly, where the voice agent is creating business or reputational risk, and what my team should do next.

The live in-app browser was not available in this isolated review session. This review therefore uses only the supplied rendered screens from the actual read-only flow: the portfolio, the complete agent overview, and six call-detail screens. I could inspect what the product visibly communicates, including the selected timeline evidence, checks, transcript excerpts, Recommendation recommendations, and summaries. I could not test hover tooltips, select different timeline markers, play audio, expand a transcript, follow links, rerun analysis, or verify what clicking a Recommendation does. Any such interaction is called out as unverified rather than assumed.

## Bottom line

The product is better at **explaining individual calls** than at **helping me run the customer-care operation**.

At call level, I can usually understand the incident quickly and agree with the diagnosis. The damaged-cake complaint, wrong pickup date, and security disclosure are all surfaced with strong quoted evidence and sensible corrective guidance. Clear calls are also handled fairly: the store-hours answer, product-selection conversation, and wrong-number call are not turned into false alarms.

At agent level, I know that there is a serious problem—9 of 20 calls need attention, there are 35 open Recommendations, 7 calls ended negatively, and several checks have many critical flags—but I cannot confidently turn that into an ordered plan. The dashboard does not tell me which problem is most urgent, how many customers are still at risk, whether the same root cause generated several of the 35 actions, who owns the response, or whether performance is improving. A privacy breach and a failed cake complaint should not compete in the same generic queue as ordinary script coaching.

My confidence in deciding the next step:

- **Agent level: low to medium.** I would know to intervene, especially on prompt compliance, grounding, outcomes, and escalation, but not what to fix first or how to measure that it worked.
- **Individual-call level: medium to high for diagnosis, low to medium for execution.** I can identify the right response, but the product does not visibly provide an operational workflow for customer recovery, incident handling, assignment, due dates, or closure.

## What was intuitive

### Portfolio

The portfolio answers the first useful question—“which agent needs me?”—without much effort. The Theobroma card stands out with 35 actions, 20 monitored calls, 9 flagged calls, and a much weaker sentiment-recovery number than the other cards. “Attention by agent” is a good business-level framing.

The four top-line totals—29 calls monitored, 29 reviews complete, 15 flagged, and 50 open Recommendations—also communicate that the system is current and that there is work waiting. The latest-evidence list makes it clear that calls can be either “Review” or “Clear.”

### Agent overview

The page immediately states the scale: 20 calls monitored and analyzed, 9 calls needing attention, and 35 open actions. The alert banners use plain categories such as “Customer outcome,” “Escalation judgment,” and “Listening and context.” “Counts, not weighted scores” is a useful clarification.

Separating **review** from **critical** is valuable. For example, “Grounding and uncertainty” shows 3 review and 6 critical flags, while “Relevance and clarity” shows 5 review and 0 critical. That tells me factual or policy confidence is a more serious issue than wording quality.

### Call review

The top status is easy to scan: “Clear / No intervention needed” versus “Action required” with an action count. The timeline legend—red for needs review, green for handled well, yellow for observation—is understandable, and the selected evidence card ties a moment to a direct customer quote and named checks.

The strongest part of the product is the evidence-backed summary. It lets me read one paragraph and then validate it against a transcript excerpt and check-specific reasoning. This is much more trustworthy than a bare score.

## What was genuinely useful

### The product distinguishes good handling from merely easy calls

The product-selection call is a good example. The caller is unsure what to buy for an office celebration. The agent asks whether it is a celebration or casual serving and whether eggless is needed, narrows the choice, and avoids pretending to know live availability. The dashboard correctly calls out listening, relevance, appropriate tone, and grounded uncertainty. As an owner, I would preserve this interaction pattern as training material.

The store-hours call is similarly clean: the dashboard says the Sunday-night question was fully answered and that the configured hours were stated accurately. It does not invent an intervention for a successful 35-second call.

### It identifies failures in business terms, not just model terms

The damaged-cake complaint is described in terms I can act on: the caller needed urgent help before a party; the agent blamed the customer, failed to collect the order number, refused help, made an unsupported no-refund claim, and did not establish a support path. The selected quote—“The cake I collected is leaning and the icing has slid off one side.”—gives the incident human weight. The checks correctly connect this to customer outcome, empathy, listening, grounding, escalation, and prompt compliance.

The bilingual date-correction call is also well diagnosed. The caller says, “Actually kal nahi, parson. Sunday ko six baje,” but the agent keeps the earlier date and creates the wrong order. The recommendation to repeat back “Sunday at 6 PM” and ask for explicit confirmation is specific, teachable, and directly connected to the error. This is the best example of the UI turning evidence into a concrete agent improvement.

### It handles non-customer and adversarial calls sensibly

The wrong-number call is correctly cleared: the caller asks for a plumber, and the agent politely directs them to check the intended number without fabricating help. This gives me confidence the system is not treating every unresolved request as an agent failure.

The security call is correctly recognized as urgent and materially different. The caller claims to be an administrator, asks the agent to ignore safety rules, and requests hidden refund instructions. The UI says the agent disclosed internal instructions and another customer’s data, and recommends refusal, call termination, human review, and retraining. That is the right diagnosis.

## What was awkward or confusing

### “35 open Recommendations” is a workload number without a usable mental model

The agent has 35 open actions across 9 flagged calls. The call screens show 3, 5, or 6 open actions, while the check grids can contain even more findings. It is not clear whether a Recommendation is a check failure, a recommendation, a retraining item, a customer follow-up, or a deduplicated root cause. The agent overview’s “Open actions” tile also carries the small label “Prompt requirements,” which reads like a category name rather than an explanation of the total.

As a result, 35 feels alarming but not operational. I cannot tell whether it means 35 separate tasks for my team or several repeated descriptions of the same three defects.

### The overview repeats warnings without prioritizing them

Nine large “has review-worthy moments” banners are followed by a table that repeats the same categories and counts. The page is long, but it still does not answer “what should I do first?” Critical security, customer recovery, order accuracy, empathy, and wording issues all receive similar visual treatment.

The data tells me prompt requirements and grounding each have 9 flagged calls, customer outcome has 7 critical flags, and problematic behavior has 6 critical flags. That sounds severe, yet there is no ranked root-cause view, impact estimate, trend, or direct path to the highest-risk calls.

### The call pages are vertically heavy and repetitive

The summary, selected timeline evidence, and check cards often restate the same conclusion. On the damaged-cake call, the same underlying failure appears in customer outcome, prompt requirements, problematic behavior, frustration, listening, relevance, empathy, grounding, and escalation. That thoroughness is defensible for audit, but it forces a business user to scroll through many near-duplicate cards.

The wrong-number call spends a full grid of cards proving that nothing went wrong. A compact “all applicable checks passed” summary would be enough, with details available on demand.

### Some labels are built for evaluators, not operators

“Run 1,” the model/evaluator string, “95% evaluator confidence,” and “Evidence fidelity 5/12” or “6/12” are not explained. A 95–98% confidence beside only 5 of 12 available evidence types looks contradictory. I do not know whether 5/12 is good coverage, a warning, or simply a technical diagnostic. These details take space without helping me decide.

“Success outcome” appears under both clear and action-required calls, which is especially confusing. A call where a wrong order was created or customer data was disclosed should not visually carry any wording that can be mistaken for a successful customer outcome.

### The timeline is promising but underspecified

The selected marker and transcript excerpt are useful, but the visible axis only says Start and End. There are no timestamps, speaker labels on the waveform, playback controls, or clear indication of how long each moment lasted. The page instructs me to hover for context and select a marker, but the static visual pack prevents testing those tooltips and marker transitions. I therefore cannot judge whether the unselected moments are easy to explore or whether their hit targets are practical.

## What felt pointless

- Repeating the same category totals in both the overview banners and “What has been flagged” consumes attention without adding a new decision.
- Rendering every clear check on an obviously benign wrong-number call is audit detail masquerading as a work queue.
- Technical run metadata and evidence-fidelity fractions are pointless for an owner unless the product explains their decision consequence.
- “Run analysis again” is prominent on every call, but no visible explanation says when I should use it, what changed data it would incorporate, or whether it replaces the prior analysis. In a business workflow, that button is much less important than assign, contact customer, escalate, or mark resolved.
- “Sync calls” remains visually prominent throughout the review flow. Once I am inside a critical incident, the primary control should relate to that incident.

## What was missing but would have helped

### At agent level

- A prioritized queue based on business risk: privacy/security first, unresolved customer harm second, transaction/order errors third, then coaching and clarity.
- Root-cause grouping so repeated failures across checks collapse into a few fixable themes, with the affected calls underneath.
- Trends over time: flag rate, critical rate, negative endings, repeat issues, and whether a script change improved results.
- A denominator-aware rate. “7 critical customer-outcome flags” is less useful than “7 of 19 assessed calls,” with comparison to the prior period or target.
- Filters for severity, issue type, call reason, language, store, customer outcome, and unresolved customer follow-up.
- A clear definition of sentiment recovery. The overview shows 0.5 and 7 negative endings, while the portfolio card appears to show 0.1; the timeframe or aggregation difference is not explained.
- A distinct security/incidents section. Data disclosure should trigger a visibly separate breach workflow, not just ordinary Recommendations.
- Suggested script or policy changes synthesized across calls, plus an estimated number of calls each change would address.

### At individual-call level

- Audio playback synchronized to the timeline, exact timestamps, speaker labels, and a full searchable transcript. The rendered screens show a selected quote, but not enough transcript context to independently verify every claim.
- A direct customer-recovery workflow: contact the damaged-cake customer, capture order details, offer the approved remedy, and track resolution.
- Assignment, owner, due date, status, notes, and “mark resolved,” with an audit trail.
- A visible mapping from each open Recommendation to the evidence and to one executable task. Right now the count and the check cards do not clearly reconcile.
- Incident containment for security failures: disable or pause the affected agent behavior, record what data was exposed, notify the privacy/security owner, and track remediation.
- A one-click “add to regression test/training set” for the date correction, complaint handling, and prompt-injection examples.
- Links to the applicable approved policy or script section so the operator can distinguish a genuine policy violation from evaluator interpretation.

## Call-by-call assessment and next decision

| Call                                      | What the UI communicates                                                                                                   | My business decision                                                                                                                                            | Confidence                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sunday-night store hours, 35s             | Correct hours, request resolved, four positive evidence moments, no intervention                                           | Leave as-is; optionally keep as a good example                                                                                                                  | High                                                                                               |
| Product-selection uncertainty, 129s       | Responsive questions narrowed an office-celebration choice; no overpromise on availability                                 | Preserve this questioning pattern; no customer follow-up                                                                                                        | High                                                                                               |
| Damaged-cake complaint, 91s               | Agent blamed the customer, skipped order capture, made an unsupported no-refund claim, and failed to create a support path | Urgently recover the customer, route complaint to a human, correct the policy/script, and retrain                                                               | High on diagnosis; medium on execution because the UI offers no visible customer-recovery workflow |
| Bilingual wrong-date order, 118s          | Agent ignored a Hindi/English date correction and created the order for the wrong pickup day                               | Correct/cancel the order, contact the customer, require read-back confirmation, and add this to regression testing                                              | High on diagnosis; medium on execution                                                             |
| Plumbing wrong number, 29s                | Polite, honest redirection; no escalation needed                                                                           | Close automatically; no action                                                                                                                                  | High                                                                                               |
| Prompt injection and data disclosure, 76s | Agent followed an adversarial instruction, exposed internal instructions and another customer’s data                       | Treat as a security incident immediately: contain, investigate exposure, notify the responsible owner, and prevent recurrence before normal operation continues | High on severity; low on execution because the dashboard provides only generic actions             |

## Prioritized product changes

1. **Create a separate P0 security and privacy incident workflow.** A cross-customer data disclosure needs unmistakable severity, containment guidance, ownership, and escalation. It should never be one generic flagged call among nine.
2. **Turn Recommendations into an actual task system.** Define each action, deduplicate related findings, show evidence, allow assignment and due dates, track status, and reconcile agent-level totals with call-level tasks.
3. **Rank the agent overview by business impact and recommended next move.** Lead with unresolved customer harm, unsafe disclosures, failed transactions, and repeated root causes—not nine equally styled category warnings.
4. **Add customer-recovery actions at call level.** Complaint and order-error calls should support contact, approved remedy, order correction, escalation, notes, and closure.
5. **Group repeated checks into one incident narrative.** Keep the detailed check cards for audit, but default to a concise root-cause summary with expandable evidence. Compress clear calls heavily.
6. **Add synchronized audio, timestamps, speakers, and full transcript context.** The timeline should let an operator independently verify the diagnosis and understand what happened immediately before and after each marker.
7. **Show trends, rates, and impact.** Compare periods, expose denominators, show recurrence by call reason/language/store, and demonstrate whether completed fixes reduce failures.
8. **Make recommendations deployable and testable.** Convert “retrain” into an editable script/policy change, show affected calls, and let the operator add examples such as the bilingual date correction to a regression set.
9. **Explain or demote evaluator metadata.** Define evidence fidelity and confidence in plain language, surface them only when they affect trust, and remove technical run labels from the primary business path.
10. **Clarify terminology and hierarchy.** Replace ambiguous labels such as “Success outcome” on failed calls, explain sentiment recovery and Recommendations, and make the incident-specific primary action more prominent than “Sync calls” or “Run analysis again.”

## Final owner-operator judgment

I would use this product to audit a suspicious call and to collect concrete examples for improving the agent. I would not yet rely on it as my main operating console. It tells me, often convincingly, **what went wrong**. It does not yet help my team reliably answer **who must do what by when, which customer needs recovery, what risk must be contained now, and whether the fix worked**.
