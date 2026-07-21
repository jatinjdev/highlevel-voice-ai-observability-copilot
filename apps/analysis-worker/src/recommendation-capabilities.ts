export type RecommendationTier = 'primary' | 'feature' | 'advanced';

export interface RecommendationCapability {
  id: string;
  label: string;
  title: string;
  uiPath: string;
  tier: RecommendationTier;
  requires: string;
  guardrail: string;
}

/**
 * The model may select only these documented HighLevel configuration surfaces.
 * This compact allowlist keeps model output constrained to supported product surfaces.
 */
export const RECOMMENDATION_CAPABILITIES = [
  capability(
    'prompt.core-instructions',
    'Prompt',
    "Clarify the agent's role, flow, and success criteria",
    'Build > Agent prompt',
    'primary',
    'current prompt and quoted transcript evidence',
    'Use a minimal exact patch; never invent missing business facts or tools.',
  ),
  capability(
    'prompt.action-trigger-instructions',
    'Prompt',
    'Clarify when and how an existing action should be used',
    'Build > Agent prompt and Actions',
    'primary',
    'configured action details plus conclusive trigger or execution evidence',
    'Separate a prompt-trigger defect from missing configuration or downstream failure.',
  ),
  capability(
    'prompt.fallback-boundaries',
    'Prompt',
    'Add a safe fallback or explicit boundary',
    'Build > Agent prompt',
    'primary',
    'current prompt and an unsupported, unsafe, or fabricated response',
    'Prefer a narrow condition and verified next step; do not promise an unconfigured handoff.',
  ),
  capability(
    'greeting.inbound-outbound',
    'Welcome message',
    'Correct the inbound or outbound greeting',
    'Build > Welcome Message > Inbound or Outbound',
    'primary',
    'call direction, current greeting, and opening evidence',
    'Preserve required disclosures and do not invent separate API capabilities.',
  ),
  capability(
    'greeting.pause-before-speaking',
    'Welcome message',
    'Adjust the pause before the greeting',
    'Build > Welcome Message > Pause Before Speaking',
    'primary',
    'recording or timestamped audio plus the current pause setting',
    'Never infer timing or a numeric value from transcript text alone.',
  ),
  capability(
    'prompt.custom-values',
    'Prompt',
    'Use a custom value for stable business text',
    'Build > Prompt or message field > Custom Value',
    'primary',
    'repeated hard-coded data and a verified existing custom value',
    'Never invent a custom value or put sensitive contact data in a static value.',
  ),
  capability(
    'knowledge-base.attach-or-create',
    'Knowledge base',
    'Create or attach a knowledge base',
    'Build > Knowledge Base',
    'feature',
    'a legitimate unanswered factual need that belongs in maintained business knowledge',
    'Do not use a knowledge base for behavior rules or invent source content.',
  ),
  capability(
    'knowledge-base.content-gap',
    'Knowledge base',
    'Add or correct knowledge-base content',
    'AI Agents > Knowledge Base > Source tabs',
    'feature',
    'attached source identity, trusted ground truth, and a verified content gap',
    'Do not diagnose retrieval from transcript alone; preserve source ownership.',
  ),
  capability(
    'knowledge-base.trigger-prompt',
    'Knowledge base',
    'Refine when the agent queries its knowledge base',
    'Build > Knowledge Base > When to use this knowledge base',
    'feature',
    'attached KB configuration, trigger prompt, retrieval evidence, and transcript evidence',
    'Do not rewrite content when the defect is trigger selection.',
  ),
  capability(
    'knowledge-base.source-quality',
    'Knowledge base',
    'Clean up stale, duplicate, or poorly structured sources',
    'AI Agents > Knowledge Base > Source tabs',
    'feature',
    'retrieval results, source inventory, and trusted source ownership',
    'Do not delete sources automatically; preserve provenance.',
  ),
  capability(
    'action.call-transfer',
    'Actions',
    'Add or correct a human call-transfer action',
    'Build > Actions > During the Call > Call Transfer',
    'feature',
    'clear transfer need, current action inventory, and verified destination policy',
    'Do not invent a destination or confuse a failed transfer with a missing action.',
  ),
  capability(
    'action.agent-transfer',
    'Actions',
    'Route a specialized intent to another Voice AI agent',
    'Build > Actions > Agent Transfer',
    'feature',
    'distinct intent, an available destination agent, and handoff policy',
    'Do not fragment a simple flow or invent a destination agent.',
  ),
  capability(
    'action.appointment-booking',
    'Actions',
    'Add or correct appointment booking',
    'Build > Actions > During the Call > Book Appointment',
    'feature',
    'booking intent, eligible calendar configuration, and action result when configured',
    'Verify calendar and fallback behavior; do not invent calendars or availability.',
  ),
  capability(
    'action.workflow',
    'Actions',
    'Trigger a workflow at the correct call event',
    'Build > Actions or Post-Call > Workflow',
    'feature',
    'automation requirement, existing workflow identity, timing, and execution evidence',
    'Distinguish during-call actions from call-end workflows and review downstream effects.',
  ),
  capability(
    'action.sms',
    'Actions',
    'Send an SMS when spoken information is insufficient',
    'Build > Actions > During the Call > Send SMS',
    'feature',
    'caller consent, reachable contact, configured action inventory, and a written-information need',
    'Respect messaging compliance; never invent or send unverified content.',
  ),
  capability(
    'action.update-contact-fields',
    'Actions',
    'Persist information collected during the call',
    'Build > Actions > After the Call > Update Contact Fields',
    'feature',
    'explicitly collected value, verified target field, and action result when configured',
    'Do not infer sensitive attributes or invent a target field.',
  ),
  capability(
    'action.custom-or-mcp',
    'Actions',
    'Use a custom action or MCP tool',
    'Build > Actions > Custom Action or Add MCP',
    'feature',
    'a defined external operation, authentication and failure contract, and business approval',
    'Prefer native actions; never propose an arbitrary external call from transcript alone.',
  ),
  capability(
    'call.idle-reminder',
    'Call settings',
    'Adjust idle reminder behavior',
    'Build > Call Settings > Idle Reminder Timer',
    'feature',
    'current setting plus recording or reliable silence timing',
    'Never infer silence timing from untimestamped transcript lines.',
  ),
  capability(
    'call.maximum-duration',
    'Call settings',
    'Adjust maximum call duration',
    'Build > Call Settings > Maximum Call Duration',
    'feature',
    'current limit plus repeated calls ending near it with unfinished intent',
    'Fix looping first and never judge quality from duration alone.',
  ),
  capability(
    'language.live-conversation',
    'Language',
    'Change the live conversation language',
    'Build > Language',
    'feature',
    'caller language, configured language, and supported voice compatibility',
    'Do not confuse live language with post-call translation.',
  ),
  capability(
    'translation.post-call-output',
    'Translation',
    'Configure transcript and summary translation',
    'Build > Translation',
    'feature',
    'agent language, review-team target language, and current translation setting',
    'Translation changes written output, not the live conversation.',
  ),
  capability(
    'post-call.workflow-and-notifications',
    'Post-call',
    'Correct post-call workflows or notification recipients',
    'Build > Post-Call',
    'feature',
    'configured workflows or recipients, expected owner, and call-end delivery evidence',
    'Protect transcript privacy and do not confuse operational delivery with conversation quality.',
  ),
  capability(
    'availability.working-hours-and-routing',
    'Deployment',
    'Correct working hours, routing, or backup behavior',
    'Deploy or Phone and Availability',
    'feature',
    'deployment configuration, call time and routing outcome, and business availability policy',
    'Treat this as operational configuration and verify routing dependencies.',
  ),
  capability(
    'reporting.performance-email',
    'Reporting',
    'Configure performance-report cadence and audience',
    'Build > Reporting > Performance Report Settings',
    'feature',
    'review ownership, call volume, cadence, and recipient permissions',
    'This improves visibility rather than agent behavior; minimize recipient exposure.',
  ),
  capability(
    'transcription.boosted-keywords',
    'Transcription & speech',
    'Add boosted keywords for misrecognized domain terms',
    'Build > Transcription & Speech > Keywords',
    'advanced',
    'reviewed audio or trusted ground truth, a specific error, and current keywords',
    'Never diagnose speech-to-text errors from transcript text alone.',
  ),
  capability(
    'speech.pronunciation',
    'Transcription & speech',
    'Correct pronunciation of a specific term',
    'Build > Transcription & Speech > Pronunciation',
    'advanced',
    'call recording, verified pronunciation, and selected voice and language',
    'Never infer pronunciation from transcript text or confuse it with speech recognition.',
  ),
  capability(
    'transcription.stt-mode',
    'Transcription & speech',
    'Review the speech-to-text mode',
    'Build > Transcription & Speech > STT Mode',
    'advanced',
    'recording-to-transcript comparison, environment, language, and current mode',
    'Prefer keyword remediation for isolated terms; never infer this from transcript alone.',
  ),
  capability(
    'audio.noise-cancellation',
    'Voice settings',
    'Adjust noise cancellation',
    'Build > Voice Settings > Noise Cancellation',
    'advanced',
    'recordings, known environment, and current noise-cancellation mode',
    'Never infer background noise from transcript text alone.',
  ),
  capability(
    'audio.backchanneling',
    'Voice settings',
    'Tune backchannel frequency or phrases',
    'Build > Voice Settings > Backchanneling',
    'advanced',
    'recordings, current backchannel settings, and language guidance',
    'Never infer audible backchannel quality from transcript text.',
  ),
  capability(
    'behavior.response-and-interruption',
    'Agent behavior',
    'Tune response speed or interruption sensitivity',
    'Build > Agent Behavior',
    'advanced',
    'timestamped recording, current behavior settings, and representative turn-taking',
    'Never use transcript order as timing evidence; change one control at a time.',
  ),
  capability(
    'behavior.temperature',
    'Agent behavior',
    'Run a controlled temperature experiment',
    'Build > Agent Behavior > Temperature',
    'advanced',
    'current temperature and repeatable failures under a stable prompt and model',
    'Never recommend temperature from one call or as a generic hallucination fix.',
  ),
  capability(
    'voice.selection-and-model',
    'Voice settings',
    'Change the voice or voice model',
    'Build > Voice and Voice Model',
    'advanced',
    'recordings or user feedback, audience language, and current voice configuration',
    'A voice change cannot fix reasoning or prompt logic.',
  ),
  capability(
    'voice.output-controls',
    'Voice settings',
    'Tune voice speed, volume, or background sound',
    'Build > Voice Settings',
    'advanced',
    'recordings, current controls, and representative phone environments',
    'Never infer audible quality from transcripts; change one control at a time.',
  ),
  capability(
    'model.llm-selection',
    'Model',
    'Evaluate a different LLM model',
    'Build > Model',
    'advanced',
    'current model, repeatable scenarios, and latency, quality, and cost requirements',
    'Never recommend a model from one bad answer; hold other variables constant.',
  ),
  capability(
    'system-prompts.module',
    'System prompts',
    'Edit the relevant system-prompt module',
    'Build > System Prompts',
    'advanced',
    'current module, repeatable module-specific failure, and main prompt review',
    'Use only after ruling out the main prompt and configuration; preserve rollback.',
  ),
  capability(
    'outbound.disclosure-and-intent',
    'Outbound settings',
    'Correct outbound disclosure, purpose, or targeting',
    'Build > Outbound Settings and Automation > Voice AI Outbound Call',
    'advanced',
    'outbound purpose, current settings, applicable policy, and originating workflow',
    'Do not give legal advice; prioritize stopping potentially non-compliant outreach.',
  ),
] as const;

export type RecommendationCapabilityId = (typeof RECOMMENDATION_CAPABILITIES)[number]['id'];

export const RECOMMENDATION_CAPABILITY_IDS = RECOMMENDATION_CAPABILITIES.map(({ id }) => id) as [
  RecommendationCapabilityId,
  ...RecommendationCapabilityId[],
];

export const PROMPT_RECOMMENDATION_CAPABILITY_IDS = RECOMMENDATION_CAPABILITIES.filter(
  ({ label }) => label === 'Prompt',
).map(({ id }) => id) as [RecommendationCapabilityId, ...RecommendationCapabilityId[]];

export const CONFIGURATION_RECOMMENDATION_CAPABILITY_IDS = RECOMMENDATION_CAPABILITIES.filter(
  ({ label }) => label !== 'Prompt',
).map(({ id }) => id) as [RecommendationCapabilityId, ...RecommendationCapabilityId[]];

export function findRecommendationCapability(
  id: RecommendationCapabilityId,
): RecommendationCapability {
  const capability = RECOMMENDATION_CAPABILITIES.find((item) => item.id === id);
  if (!capability) throw new Error(`Unknown recommendation capability: ${id}`);
  return capability;
}

export function renderRecommendationCapabilityCatalogue(): string {
  return RECOMMENDATION_CAPABILITIES.map(
    (item) =>
      `- ${item.id} | ${item.label} | ${item.title} | UI: ${item.uiPath} | ` +
      `Requires: ${item.requires} | Guardrail: ${item.guardrail}`,
  ).join('\n');
}

function capability<
  const Id extends string,
  const Label extends string,
  const Title extends string,
  const UiPath extends string,
>(
  id: Id,
  label: Label,
  title: Title,
  uiPath: UiPath,
  tier: RecommendationTier,
  requires: string,
  guardrail: string,
) {
  return { id, label, title, uiPath, tier, requires, guardrail } as const;
}
