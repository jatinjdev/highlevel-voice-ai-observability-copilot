# HighLevel Voice AI agent configuration API

Checked: 2026-07-16

## Conclusion

HighLevel now exposes a v3 Voice AI Agents API. A sub-account OAuth token or
sub-account Private Integration Token can retrieve an agent with:

```http
GET https://services.leadconnectorhq.com/voice-ai/agents/{agentId}?locationId={locationId}
Version: v3
Authorization: Bearer {token}
```

The app's existing OAuth grant includes `voice-ai-agents.readonly`. A live,
read-only request for the test agent succeeded with HTTP 200.

The response exposed the agent identity, business name, greeting, prompt,
voice ID, language, responsiveness, maximum call duration, idle-reminder
settings, inbound-number assignments, call-end workflows, post-call
notification recipients, working hours, timezone, backup-agent behavior,
translation settings, strict tool-call mode, and the agent's actions array.

This should be treated as the complete configuration exposed by the public
Voice AI Agent API, not necessarily every control present in the HighLevel UI.
The live response did not expose knowledge-base attachments, transcription or
keyword-boosting settings, speech tuning, the underlying model, temperature,
or comparable generation settings.

HighLevel also documents a separate action endpoint:

```http
GET https://services.leadconnectorhq.com/voice-ai/actions/{actionId}
Version: v3
Authorization: Bearer {token}
```

It returns action configuration including `actionParameters`. The current test
agent returned `actions: []`, so no action-detail request was necessary.

## Primary sources

- [Get Voice AI Agent](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/get-agent/)
- [Voice AI Agents](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/agents/)
- [Create Voice AI Agent schema](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/create-agent/)
- [Get Voice AI Agent Action](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/get-action/)
- [Voice AI authentication](https://marketplace.gohighlevel.com/docs/ghl/voice-ai/voice-ai-api/)
