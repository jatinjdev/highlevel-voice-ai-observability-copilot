# HighLevel sandbox installation

This runbook installs the app as a private Marketplace app in a HighLevel App Test Account Location.

## Integration model

The app uses a **Marketplace Custom Page**, not Custom JS. HighLevel owns the Location navigation
entry and iframe; this repository owns the Vue application, NestJS services, PostgreSQL, queues, and
model requests.

```text
Developer Marketplace account
  Private Marketplace app and test version

App Test Account (sandbox Agency)
  Sub-account / Location
    Voice AI agents and calls
    Installed Marketplace app
    Embedded Custom Page
```

The app targets **Sub-account**. A Private Integration Token is supported only as a local-development
fallback; it does not install the app, provide signed iframe context, or subscribe to webhooks.

## Deployment URLs

| Purpose          | URL                                                             |
| ---------------- | --------------------------------------------------------------- |
| Custom Page      | `https://dng3naypayh7.cloudfront.net/`                          |
| OAuth redirect   | `https://dng3naypayh7.cloudfront.net/api/leadconnector/oauth`   |
| Webhook receiver | `https://dng3naypayh7.cloudfront.net/api/leadconnector/webhook` |
| Readiness        | `https://dng3naypayh7.cloudfront.net/api/health/ready`          |

For another environment, replace the origin consistently. The OAuth redirect must match the saved
Marketplace value exactly.

## Marketplace builder configuration

### 1. Create the app

- Distribution: **Private**
- Name: **Voice AI Observability Copilot**
- Target User: **Sub-account**
- Testing access: the intended App Test Account

Target User cannot be changed after app creation, so confirm it before continuing.

### 2. Add the Custom Page

Under **Build → Modules**, add one Custom Page:

- Navigation label: **Voice AI Observability Copilot**
- Live URL: the Custom Page URL above
- Testing URL: the same Custom Page URL
- Placement: Location left navigation
- Custom JS: disabled

The frontend requests encrypted user context from the HighLevel parent window and exchanges it for a
short-lived, Location-bound application session. A `locationId` query parameter is never used as the
production authorization boundary.

### 3. Grant scopes

The direct Sub-account installation uses only these read scopes:

| Scope                           | Use                                                |
| ------------------------------- | -------------------------------------------------- |
| `voice-ai-dashboard.readonly`   | Read call logs and receive `VoiceAiCallEnd`        |
| `voice-ai-agents.readonly`      | Read agents and their current public configuration |
| `voice-ai-agent-goals.readonly` | Read configured goals and actions when returned    |

No Voice AI, contact, workflow, or agent write scope is required. The app recommends changes but
never applies them.

`oauth.readonly` and `oauth.write` are needed only when enabling Agency-level bulk installation and
the Company-token-to-Location-token exchange. They are not required for a direct Sub-account install.

### 4. Configure OAuth and secrets

1. Register the exact OAuth redirect URL.
2. Copy the Client ID and one Client Secret.
3. Generate the Marketplace Shared Secret used for encrypted Custom Page user context.
4. Generate the application token-encryption key:

   ```bash
   openssl rand -base64 32
   ```

5. Store all four values in backend secrets only.

Never place a secret in a `VITE_*` variable, browser bundle, screenshot, or log. Multiple Client Keys
exist for credential rotation and separate environments; one current key is sufficient for this
deployment.

### 5. Configure the webhook

Under the version's webhook settings:

- Webhook URL: the receiver URL above
- Event: `VoiceAiCallEnd`

The receiver also accepts supported install/update/uninstall lifecycle payloads. Incoming events are
verified with HighLevel's Ed25519 signature over the exact raw body and stored idempotently before
background processing.

### 6. Save and install a test version

1. Save a version containing the Custom Page, scopes, OAuth redirect, and webhook.
2. Generate the standard **Test Link** for the sandbox Location.
3. Open the link while signed into the App Test Account.
4. Select the intended Sub-account and authorize the app.
5. Confirm the callback lands on `/?oauth=connected&locationId=...`.
6. Open the Location and select **Voice AI Observability Copilot** from the left navigation.
7. Confirm the page renders inside HighLevel without an iframe or CSP error.

Use the standard link for the HighLevel-branded sandbox. The white-label link is only for an
Agency's custom branded domain and does not change OAuth behavior.

## Runtime verification

### Existing agents and calls

1. Open **Voice Agents**. The app fetches all pages of the Location's current Voice Agents and
   upserts their identity. Previously saved agents remain visible if HighLevel is temporarily
   unavailable.
2. Open one agent and select **Analyze → Last 24 hours** or **Last 7 days**.
3. Confirm calls appear as queued/processing and later show checklist results.
4. Run the same import again and confirm existing calls update rather than duplicate.

Agent discovery does not import call history automatically. Imports are additive and never remove
calls outside the selected window.

### New call

1. Complete a Voice AI Web Call.
2. Confirm `VoiceAiCallEnd` appears in the Marketplace webhook log with a `2xx` response.
3. Open the agent page and confirm the call appears as queued or processing.
4. Open the call while processing and confirm the transcript is readable.
5. Wait for the call overview and Success Criteria results.
6. Select **View evidence** on a failed criterion and confirm the cited transcript line is
   highlighted.

The webhook does not wait for a model. PostgreSQL inbox/outbox records and SQS make retries safe;
queue payloads contain identifiers rather than transcripts.

### Custom criteria and recommendations

The app does not infer business requirements from historical calls. The owner translates the
agent's intended goal, script, or policy into firm natural-language criteria.

1. Add a criterion with a unique name and a firm natural-language description.
2. Analyze an existing call explicitly if the new criterion should be applied retroactively.
3. Confirm failures retain a reason and exact transcript or Call Action evidence.
4. Return to the agent and select **Generate** beside AI recommendations.
5. Confirm generated cards are based on failed criteria and the current HighLevel configuration.

Recommendations may contain an exact prompt removal, paste-ready addition, both, or direct manual
configuration advice. Deleting or regenerating recommendations never changes the HighLevel agent.

## Security checks

- Invalid webhook signatures return an error.
- Changing a query-string Location ID cannot cross the signed session boundary.
- OAuth tokens are encrypted at rest and refreshed atomically.
- Browser assets contain no Marketplace, model-provider, or database secrets.
- The readiness endpoint verifies PostgreSQL.
- Containers run as a non-root user with read-only filesystems.
