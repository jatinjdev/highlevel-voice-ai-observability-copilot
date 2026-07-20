# ADR 0007: Checklist-only calls and manual agent recommendations

- Status: accepted
- Supersedes: ADR 0004 and ADR 0006

Call Analysis evaluates criterion descriptions only against observable Call evidence. Criteria
are identified by unique names without versions or sets. Recommendations are never created for
individual Calls or automatically after analysis; a user requests one for a failed criterion, and
the system compares recent failures with the Voice Agent's current prompt before storing one
replaceable agent-level recommendation. This trades historical criterion comparability for a much
smaller, explainable assessment product whose judgments and guidance cannot be confused.

The same schema-constrained model request also returns an informational Call Overview with the
caller's intent, outcome, and expressed sentiment. These fields exist only to provide context in
the call-review sidebar. They are not Criterion Results and cannot create flags, affect adherence,
participate in agent aggregation, or generate recommendations.

Recommendation generation samples at most the 20 most recent current failures for the selected
criterion. A prompt change invalidates stored guidance, and a response produced for an older prompt
or superseded request is discarded rather than published.
