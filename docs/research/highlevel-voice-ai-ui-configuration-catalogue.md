# HighLevel Voice AI Agent Builder: UI configuration catalogue

Research date: 2026-07-16
Scope: the current HighLevel **Voice AI Agent Builder** shown in the supplied July 2026 screenshots, cross-checked against first-party HighLevel help articles and public developer documentation. No third-party source is treated as authoritative.

## Executive conclusion

HighLevel's current builder exposes a much larger recommendation surface than its public Voice AI Agent API. The editor should be treated as the product feature catalogue; the public API should be treated as a narrower automation contract.

For the observability product this means:

- recommendations should cover every real UI setting, even when the setting cannot be changed by API;
- each recommendation must carry an **application mode**: `api_apply`, `manual_in_highlevel`, or `requires_user_review`;
- only documented API request fields should ever be auto-applied;
- an API-read response field is not automatically a supported write field;
- settings documented only by the current editor are valid manual recommendation targets, but their values and constraints must not be invented.

The primary first-party overview is HighLevel's [How to Create Voice AI Agents](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents). It explicitly identifies agent identity, voice, timezone, LLM, greeting, Call Settings, Agent Behavior, Transcription & Speech, Voice Settings, Knowledge Base, actions, post-call workflows/notifications, phone assignment, working hours, and testing. The current screenshots additionally expose Translation, Reporting, System Prompts, and Outbound Settings as their own sections.

## Evidence labels

- **Help article** — described in a current HighLevel Support article.
- **Editor + help** — exact current editor label is visible in the supplied screenshots/current first-party guide screenshot, while a help article describes the capability.
- **Editor only** — the current editor shows the setting, but no dedicated first-party article with its child controls/constraints was found.
- **Public API RW** — documented public read/update support exists.
- **Public API R** — available in a documented response/catalogue, but no documented write field was found.
- **No public API field found** — absent from the documented Agent PATCH and the public Actions/Knowledge Base contracts reviewed. This does not mean HighLevel's own UI lacks an internal backend.

## 1. Core agent, model, prompt, and greeting

| UI setting                                        | What it controls                                                             | Documented values / constraints                                                                                                       | Source status | Public API status                                                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Name                                        | Human-readable agent identity                                                | Help example: “Customer Support Bot”; Agent PATCH documents 1–40 characters                                                           | Help article  | **RW**: `agentName`                                                                                                                                                   |
| Business Name                                     | Business the agent represents                                                | Defaults to the location name in the API documentation                                                                                | Help article  | **RW**: `businessName`                                                                                                                                                |
| Voice                                             | Text-to-speech voice used by the agent                                       | Previewable catalogue; filters can include language, accent and gender; stock, imported ElevenLabs and cloned voices may be available | Help article  | **RW**: `voiceId`; public voice catalogue/detail APIs are documented                                                                                                  |
| Model / LLM                                       | Language model that generates responses                                      | Current editor visibly offers model selection (example: GPT-4.1). Available models/pricing may change                                 | Editor + help | **No public Agent PATCH field found**                                                                                                                                 |
| Language                                          | Spoken call language                                                         | HighLevel documents many individual languages plus Multilingual; available voices vary by language                                    | Help article  | **RW**: `language`, but the public PATCH enum is narrower than the latest help-centre language list; do not assume every UI language is currently accepted by the API |
| Timezone                                          | Time interpretation, working hours and reporting context                     | IANA/business timezone selected per agent                                                                                             | Help article  | **RW**: `timezone`                                                                                                                                                    |
| Agent Prompt                                      | Main business instructions, objectives, logic and call flow                  | Free-form prompt; editor supports custom values and prompt-improvement tools                                                          | Editor + help | **RW**: `agentPrompt`                                                                                                                                                 |
| Custom Value                                      | Inserts HighLevel custom values into the agent prompt/greeting               | Exact availability depends on the location's custom values                                                                            | Help article  | No distinct Voice AI setting; values are materialized inside writable prompt text                                                                                     |
| Edit Prompts with AI                              | Rewrites/refines selected prompt text                                        | Suggestions are reviewed before acceptance                                                                                            | Help article  | **No public API field/tool found**; final prompt itself can be written through `agentPrompt`                                                                          |
| Prompt Optimizer                                  | Scenario-based real-call testing, evaluation and prompt-variation generation | 1–10 calls per scenario; up to five auto variations; live prompt is unchanged until “Use Prompt” is selected; results are directional | Help article  | **No public API contract found** for optimiser runs; resulting prompt can be applied through `agentPrompt`                                                            |
| Welcome Message / Initial Greeting                | First message spoken to a caller                                             | Current UI supports separate Inbound/Outbound greeting text                                                                           | Editor + help | **RW**: `welcomeMessage`, but public docs do not expose separate inbound/outbound message fields                                                                      |
| Who speaks first                                  | Whether the AI or caller begins                                              | Current screenshot shows “AI speaks first”; the full option set is not documented in the reviewed help articles                       | Editor only   | **No public API field found**                                                                                                                                         |
| Pause Before Speaking / Wait Time Before Speaking | Delay before the first greeting                                              | Current editor exposes this control; constraints were not documented in the reviewed help article                                     | Editor + help | **No public API field found**                                                                                                                                         |
| Auto-translated greeting                          | Updates the initial greeting when the agent language changes                 | The generated translation remains editable and should be tested                                                                       | Help article  | No dedicated API operation; `language` and `welcomeMessage` are writable independently                                                                                |

Sources: [creation guide](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents), [multi-language support](https://help.gohighlevel.com/support/solutions/articles/155000004683), [voice selection and imports](https://help.gohighlevel.com/support/solutions/articles/155000005874-how-to-edit-a-voice-ai-agents-voice), [voice cloning](https://help.gohighlevel.com/support/solutions/articles/155000007988-create-and-use-voice-ai-voice-cloning), [auto-translated greetings](https://help.gohighlevel.com/support/solutions/articles/155000007512-how-auto-translated-greetings-work-in-voice-ai), [Edit Prompts with AI](https://help.gohighlevel.com/support/solutions/articles/155000007529-voice-ai-edit-prompts-with-ai), [Prompt Optimizer](https://help.gohighlevel.com/support/solutions/articles/155000007781-voice-ai-prompt-optimizer), [Patch Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/patch-agent/).

## 2. Actions

The builder separates actions into **During the Call** and **After the Call**. The current editor's New Action menu visibly contains Call Transfer, Trigger a Workflow, Send SMS, Update Contact Field, Appointment Booking, Custom Action 2.0, Agent Transfer, and Add MCP (Beta). The current creation guide independently lists Call Transfer, Trigger a Workflow, Send SMS, Update Contact Fields, Appointment Booking, Custom Action, and MCP (Beta).

| Action                  | What it controls                                                      | Documented constraints / details                                                                                  | Source status | Public API status                                                                                        |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| Call Transfer           | Transfers caller to a human/number when a configured condition is met | During-call action; destination and trigger instructions; transfer guidance should also be explicit in the prompt | Help article  | Public action CRUD exists, but only use action types/parameters accepted by the documented action schema |
| Agent Transfer          | Transfers between Voice AI agents                                     | Dedicated current help article exists; shown in current editor                                                    | Editor + help | Public generic action CRUD exists; no separate top-level Agent PATCH field                               |
| Trigger a Workflow      | Runs a HighLevel workflow when its trigger conditions are met         | Supported during call; agent can also have post-call workflow IDs                                                 | Help article  | Action CRUD for during-call action; **Agent PATCH RW** for `callEndWorkflowIds` after call               |
| Send SMS                | Sends an SMS as part of the interaction                               | Supported during call in the separate-actions article                                                             | Help article  | Public generic action CRUD exists                                                                        |
| Update Contact Field(s) | Writes collected details to contact fields                            | Updated action layout places this after call; up to 25 contact-field update actions                               | Help article  | Public generic action CRUD exists                                                                        |
| Appointment Booking     | Looks up availability and books an appointment                        | One appointment-booking action per agent; calendar/action configuration must be valid                             | Help article  | Public generic action CRUD exists                                                                        |
| Custom Action 2.0       | Calls a custom integration/webhook/tool                               | During-call; shown as Beta in the separate-actions article                                                        | Help article  | Public generic action CRUD exists and exposes `actionParameters`                                         |
| Add MCP                 | Connects an MCP tool/server for agent capabilities                    | Marked Beta in the current UI/guide                                                                               | Editor + help | **No dedicated public Voice AI MCP action contract found** beyond generic action APIs                    |

The updated action builder documents a maximum of **15 total during-call actions**, **one appointment booking action**, and **up to 25 after-call contact-field update actions**. See [Separate During-Call and Post-Call Actions](https://help.gohighlevel.com/support/solutions/articles/155000005267-separate-during-call-and-post-call-actions-in-voice-ai), [creation guide](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents), [public Actions API](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/actions/index.html), and [Voice AI Public APIs overview](https://help.gohighlevel.com/support/solutions/articles/155000006379-voice-ai-public-apis).

## 3. Knowledge Base

### Agent-level controls

| UI setting                      | What it controls                                                     | Documented values / constraints                                   | Source status   | Public API status                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Select / connect Knowledge Base | Chooses the business knowledge source available to the agent         | One Knowledge Base per Voice AI agent                             | Help article    | Knowledge Base metadata CRUD is public, but **no documented public Voice AI Agent field was found for attaching/detaching it** |
| When to use this knowledge base | Trigger prompt that tells the agent when retrieval should be invoked | If caller input does not match the trigger, the KB is not queried | Help article    | **No public Agent PATCH field found**                                                                                          |
| Create New                      | Creates a new shared HighLevel Knowledge Base                        | Public API documents a maximum of 15 Knowledge Bases per location | Help + API docs | **KB metadata RW** through the Knowledge Base API; source ingestion and Voice AI attachment are separate concerns              |

### Content that can live in a HighLevel Knowledge Base

The current centralized Knowledge Base UI documents these source tabs:

- **Web Crawler** — Exact URL, all URLs in a domain, or all URLs sharing a path; up to 4,000 web URLs per Knowledge Base; content can be refreshed or removed.
- **FAQ** — structured question/answer material.
- **Web Search** — web-search source tab in the current centralized UI.
- **Tables** — structured tabular facts.
- **Rich Text** — directly authored and editable content.
- **File Upload** — DOC, DOCX, and PDF; text is ingested, embedded images are skipped; detected headings influence chunking.

Sources can coexist. HighLevel recommends using its Retrieval Tester to ask customer-style questions and inspect which source is returned. Duplicate, overlapping, stale, image-only, or poorly headed content can reduce retrieval quality.

This enables recommendation families beyond prompt edits: attach the right KB; narrow or broaden the KB trigger; add missing FAQ/policy/product content; crawl a specific authoritative page rather than an irrelevant domain; refresh stale URLs; remove conflicting sources; convert scanned/image-only documents to selectable text; improve document headings/chunk structure; or validate retrieval with representative queries.

Sources: [Voice AI KB integration](https://help.gohighlevel.com/support/solutions/articles/155000005266-knowledge-base-integration-for-voice-ai-agents), [Knowledge Base Overview](https://help.gohighlevel.com/support/solutions/articles/155000007313-knowledge-base-overview), [Document & Rich-Text Support](https://help.gohighlevel.com/support/solutions/articles/155000006671), [Web URLs and Links](https://help.gohighlevel.com/support/solutions/articles/155000001338), [Web Crawler](https://help.gohighlevel.com/support/solutions/articles/155000006625-knowledge-base-web-crawler), [Knowledge Base API](https://marketplace.gohighlevel.com/docs/ghl/knowledge-base/knowledge-base/index.html).

## 4. Call Settings

| UI setting               | What it controls                                                   | Documented values / constraints                                                                                              | Source status     | Public API status                                         |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| Maximum Call Duration    | Hard limit on call duration                                        | Public PATCH documents 180–900 seconds                                                                                       | Editor + API docs | **RW**: `maxCallDuration`                                 |
| Send User Idle Reminders | Enables re-engagement prompt after caller silence                  | Per agent                                                                                                                    | Editor + help     | **RW**: `sendUserIdleReminders`                           |
| Idle Reminder Timer      | Seconds of caller silence before the reminder                      | 1–20 seconds; default 8; call ends if silence continues for more than 15 seconds after reminder                              | Help article      | **RW**: `reminderAfterIdleTimeSeconds`                    |
| Silence Detection        | Controls how silence is detected/handled beyond the reminder timer | Section is explicitly named in current editor subtitle; child values/constraints were not found in reviewed first-party docs | Editor only       | **No public API field found** beyond idle-reminder fields |

Source: [Idle Reminder Timer](https://help.gohighlevel.com/support/solutions/articles/155000005207-how-to-keep-callers-engaged-with-the-voice-ai-idle-reminder-timer), [Patch Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/patch-agent/).

## 5. Agent Behavior

| UI setting               | What it controls                                    | Documented values / constraints                                                    | Source status                                                      | Public API status                                                                                                                         |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Response Speed           | Conversation response timing/latency                | Exact UI values and direction were not found in reviewed first-party help articles | Editor only                                                        | **No documented PATCH field named response speed/responsiveness**. A read payload may expose `responsiveness`; do not infer write support |
| Interruption Sensitivity | How readily caller audio interrupts/stops the agent | Exact scale semantics were not found in current help documentation                 | Editor only; first-party feature board confirms the control exists | **No public API field found**                                                                                                             |
| Temperature              | Variability/creativity of model responses           | Exact range/default not documented in the reviewed first-party docs                | Editor only                                                        | **No public API field found**                                                                                                             |
| Backchanneling           | Adds short acknowledgements during micro-pauses     | Enable/disable, frequency from rare to frequent, editable backchannel words        | Help article; Labs-dependent                                       | **No public API field found**                                                                                                             |

Source: [Noise Cancellation & Backchanneling](https://help.gohighlevel.com/support/solutions/articles/155000007002-voice-ai-noise-cancellation-backchanneling). For response speed, interruption sensitivity, and temperature, the current editor is the primary evidence; no constraints should be encoded until HighLevel documents them or they are captured from the live control.

## 6. Transcription & Speech

| UI setting                               | What it controls                                                                       | Documented values / constraints                                                                                 | Source status | Public API status             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- |
| STT Mode                                 | Speech-to-text mode/provider behaviour                                                 | Current editor subtitle names STT mode; exact options were not found in reviewed first-party docs               | Editor only   | **No public API field found** |
| Boosted Keywords / Keywords              | Improves recognition of domain-specific words, names, brands, addresses or terminology | Current editor names keywords; exact limits, boost scale and syntax were not found in reviewed first-party docs | Editor only   | **No public API field found** |
| Pronunciation / Pronunciation Dictionary | Controls how specified terms are spoken                                                | Current editor names pronunciation; exact formats/limits were not found in reviewed help docs                   | Editor only   | **No public API field found** |

These are legitimate manual recommendation targets. Examples: add a repeatedly mistranscribed brand/product/place name to boosted keywords; add a pronunciation entry when the **agent's spoken output** mispronounces a term; change STT mode only when repeated recognition errors across recordings support it. Do not recommend keyword boosting for an LLM reasoning failure, or pronunciation changes for a caller-audio transcription problem without evidence.

## 7. Translation

| UI setting                  | What it controls                               | Documented values / constraints                                          | Source status | Public API status              |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ | ------------- | ------------------------------ |
| Enable Translation          | Generates translated written post-call outputs | Agent-level; available when call language is non-English or Multilingual | Help article  | **RW**: `translation.enabled`  |
| Translation Target Language | Language of translated transcript and summary  | Distinct from the language spoken during the call                        | Help article  | **RW**: `translation.language` |

Translation affects post-call transcript/summary, not the live call language. Source: [Voice AI Translation Service](https://help.gohighlevel.com/support/solutions/articles/155000005797).

## 8. Voice Settings

| UI setting         | What it controls                                                      | Documented values / constraints                                                               | Source status                                                      | Public API status                                          |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Voice selection    | Voice identity/provider/model                                         | Stock catalogue, preview, imported ElevenLabs voices, and Labs voice cloning                  | Help article                                                       | **RW**: `voiceId`; catalogue/details are publicly readable |
| Voice Speed        | Spoken delivery speed                                                 | Exact range/default not found in reviewed first-party docs                                    | Editor only                                                        | **No public API field found**                              |
| Volume             | Agent output loudness                                                 | Exact range/default not found                                                                 | Editor only                                                        | **No public API field found**                              |
| Background Sound   | Adds ambient sound and controls its level                             | Current editor subtitle confirms background sound; detailed help article not found            | Editor only                                                        | **No public API field found**                              |
| Noise Cancellation | Suppresses ambient noise and optionally overlapping background speech | Modes: Remove Noise; Remove Noise + Background Speech                                         | Help article; Labs-dependent                                       | **No public API field found**                              |
| Backchanneling     | Natural listener cues                                                 | Enable, frequency, editable phrases; presented in HighLevel's audio-enhancement documentation | Help article; may appear under behaviour/audio settings by rollout | **No public API field found**                              |

Sources: [voice selection](https://help.gohighlevel.com/support/solutions/articles/155000005874-how-to-edit-a-voice-ai-agents-voice), [voice cloning](https://help.gohighlevel.com/support/solutions/articles/155000007988-create-and-use-voice-ai-voice-cloning), [Noise Cancellation & Backchanneling](https://help.gohighlevel.com/support/solutions/articles/155000007002-voice-ai-noise-cancellation-backchanneling).

## 9. Post-Call

| UI setting                    | What it controls                                               | Documented values / constraints                                                                               | Source status | Public API status                    |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------ |
| Post-call workflows           | Workflows invoked after call completion                        | Multiple workflow IDs supported; public PATCH documents up to 10                                              | Help article  | **RW**: `callEndWorkflowIds`         |
| Post-call email notifications | Sends call summary, contact data, transcript and actions taken | Recipients can include admins, users, assigned user, specific users or custom emails depending current UI/API | Help article  | **RW**: `sendPostCallNotificationTo` |
| After-call actions            | Structured actions executed after the call                     | Updated action layout currently documents Update Contact Fields; up to 25                                     | Help article  | Public action CRUD exists            |

Post-call notification configuration is distinct from recurring Reporting. Sources: [creation guide](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents), [Separate During/Post Call Actions](https://help.gohighlevel.com/support/solutions/articles/155000005267-separate-during-call-and-post-call-actions-in-voice-ai), [Patch Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/patch-agent/).

## 10. Reporting

| UI setting                                     | What it controls                      | Documented values / constraints                                                         | Source status                | Public API status                     |
| ---------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| Performance Summary Email / Performance Report | Scheduled email summary for one agent | Weekly, Fortnightly, or Monthly; per-agent configuration; skipped for zero-call periods | Help article; Labs-dependent | **No public Agent PATCH field found** |
| Report recipients                              | Who receives recurring report         | All location admins, all users, specific users, custom email addresses                  | Help article                 | **No public Agent PATCH field found** |

Reports can include call volume/duration, success rate, sentiment, after-hours calls, action breakdown, period comparison and up to three anomalous calls. Source: [Voice AI Performance Reports](https://help.gohighlevel.com/support/solutions/articles/155000007984-voice-ai-performance-reports) and [Performance Summary Emails](https://help.gohighlevel.com/support/solutions/articles/155000005214-how-to-configure-voice-ai-performance-summary-emails).

## 11. System Prompts

The System Prompts section exposes HighLevel's underlying modules, separate from the business-authored `agentPrompt`:

| Module                         | What it controls                                                                          | Editability described by HighLevel                 | Public API status                 |
| ------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------- |
| Personality                    | Tone, warmth, empathy, pacing, active listening, confirmations and phrasing variation     | Personality guidelines can be fine-tuned           | **No public API field found**     |
| Appointment Booking Logic      | Slot lookup, confirmation, rejection, time preferences, unclear input                     | Visible; protected/default logic may limit editing | **No public API field found**     |
| Date & Time Awareness          | Relative date interpretation, parts-of-day ranges, timezone context                       | Visible                                            | **No public API field found**     |
| Numbers & Symbols Speech Rules | Speech for numbers, currencies, ordinals, addresses, special characters and alphanumerics | Visible                                            | **No public API field found**     |
| Email Confirmation Process     | Collection, repeat-back, spelling, corrections and prohibited phrasing                    | Visible                                            | **No public API field found**     |
| Reset to Default               | Restores HighLevel-maintained defaults                                                    | Available after controlled edits                   | **No public API operation found** |

Recommendation guardrail: system-prompt changes should be advanced/manual, supported by repeated evidence, and used only when the failure originates in a foundational module rather than the user's ordinary agent prompt. Source: [Exposed System Prompts](https://help.gohighlevel.com/support/solutions/articles/155000007215).

## 12. Outbound Settings

| UI setting                | What it controls                                             | Documented values / constraints         | Source status | Public API status                     |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------- | ------------- | ------------------------------------- |
| AI disclaimer style       | How the outbound agent discloses itself and opt-out language | Concise, Standard, or Conversational    | Help article  | **No public Agent PATCH field found** |
| Disclaimer preview        | Preview of disclosure text                                   | Generated from selected style           | Help article  | **No public API field found**         |
| Agent Intent Message      | Why the agent is calling                                     | Added to the complete outbound greeting | Help article  | **No public API field found**         |
| Complete Greeting Preview | Combined disclosure, intent and greeting                     | Review before publishing                | Help article  | **No public API field found**         |

Outbound Voice AI also depends on location KYC/eligibility, consent responsibility, DND/opt-outs, allowed calling hours, domestic/same-country restrictions and platform rate limits. These are deployment/compliance constraints, not transcript-tuning knobs. Source: [Outbound Calling Compliance Checks](https://help.gohighlevel.com/support/solutions/articles/155000006679-voice-ai-outbound-calling-compliance-checks) and [Outbound Calling](https://help.gohighlevel.com/support/solutions/articles/155000006598-voice-ai-outbound-calling).

## 13. Deploy, phone assignment, availability, and testing

| UI setting                     | What it controls                                      | Documented values / constraints                                                           | Source status | Public API status                                                                 |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| Inbound Number(s)              | Phone numbers routed to the agent                     | One or multiple HighLevel/LC Phone or Twilio numbers, subject to availability and routing | Help article  | **RW**: `inboundNumber`, `numberPoolId`; read payload may expose `inboundNumbers` |
| Number Pool                    | Group of numbers assigned to an agent                 | Separate first-party feature; exact pool rules outside this catalogue                     | Help article  | **RW**: `numberPoolId`                                                            |
| Working Hours                  | Days/time intervals during which agent handles calls  | Per-agent schedule                                                                        | Help article  | **RW**: `agentWorkingHours` and `timezone`                                        |
| Agent as backup                | Whether Voice AI can act as backup in routing         | Public API exposes disable flag                                                           | API docs      | **RW**: `isAgentAsBackupDisabled`                                                 |
| Test call type                 | Browser Web Call or real Phone Call                   | Web Call does not support Call Transfer; Phone Call may incur normal telephony rates      | Help article  | **No public test-call API documented**                                            |
| Test scenario                  | Inbound or Outbound                                   | Outbound requires outbound capability/registration                                        | Help article  | **No public test-call API documented**                                            |
| Call History / Live Transcript | Review test calls and current browser-call transcript | Test logs are excluded from production dashboard metrics                                  | Help article  | Public call-log APIs exist, but no editor testing control API is documented       |

Source: [creation guide](https://help.gohighlevel.com/support/solutions/articles/155000004107-creating-voice-ai-agents), [How to Test Voice AI Agents](https://help.gohighlevel.com/support/solutions/articles/155000004108), [test call logs](https://help.gohighlevel.com/support/solutions/articles/155000005211-how-to-view-test-call-logs-in-the-voice-ai-dashboard), [Patch Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/patch-agent/).

## Public Agent PATCH boundary

The current documented Agent PATCH exposes this practical writable subset:

```text
agentName
businessName
welcomeMessage
agentPrompt
voiceId
language
patienceLevel
maxCallDuration
sendUserIdleReminders
reminderAfterIdleTimeSeconds
inboundNumber
numberPoolId
callEndWorkflowIds
sendPostCallNotificationTo
agentWorkingHours
timezone
isAgentAsBackupDisabled
translation
```

HighLevel's public Actions API separately provides create/get/update/delete operations for agent actions, and the Knowledge Base API separately provides Knowledge Base metadata CRUD. Neither fact expands Agent PATCH to every current editor control. The public API overview itself directs developers to the live API reference for the latest request/response schemas: [Voice AI Public APIs](https://help.gohighlevel.com/support/solutions/articles/155000006379-voice-ai-public-apis).

## Implication for a recommendation catalogue

Store recommendation targets as capabilities, not arbitrary parameter names. A safe catalogue record should contain at least:

```text
capability_id
ui_section
ui_setting
problem_signals
recommended_change
expected_effect
evidence_required
priority_tier
application_mode
api_contract_field (nullable)
help_url
risk_and_guardrails
```

Suggested default priority classes:

1. **Common, low-risk:** prompt clarity/order, greeting wording, explicit action conditions, KB content/trigger gaps, missing post-call workflow.
2. **Targeted operational:** add/fix action configuration, boosted keywords, pronunciation entries, idle timing, transfer routing, voice/language alignment, KB source cleanup.
3. **Advanced, evidence-heavy:** STT mode, interruption sensitivity, response speed, temperature, voice audio processing, system prompts, model choice, outbound disclosure/compliance configuration.

The classes are recommendation policy—not an assertion that every setting has an API. Any unsupported setting remains `manual_in_highlevel` with a deep link/instructions and the supporting call evidence.
