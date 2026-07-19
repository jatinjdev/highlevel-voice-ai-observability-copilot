import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const voiceAgentSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  agentName: z.string(),
  businessName: z.string().optional(),
  agentPrompt: z.string().optional(),
});

export type VoiceAgent = z.infer<typeof voiceAgentSchema>;

export const callLogSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  agentId: z.string(),
  contactId: z.string().optional(),
  createdAt: z.string(),
  duration: z.number().nonnegative(),
  summary: z.string().optional(),
  transcript: z.string(),
  trialCall: z.boolean().optional(),
});

export type CallLog = z.infer<typeof callLogSchema>;

export const voiceCallEndPayloadSchema = z
  .object({
    type: z.literal('VoiceAiCallEnd'),
    id: z.string().min(1),
    locationId: z.string().min(1),
    agentId: z.string().min(1),
    contactId: z.string().min(1).optional(),
    createdAt: z.iso.datetime(),
    duration: z.coerce.number().nonnegative(),
    summary: z.string().optional(),
    transcript: z.string(),
    translation: z.record(z.string(), z.unknown()).nullable().optional(),
    extractedData: z.record(z.string(), z.unknown()).default({}),
    executedCallActions: z.array(z.unknown()).default([]),
    trialCall: z.boolean().default(false),
  })
  .passthrough();

export type VoiceCallEndPayload = z.infer<typeof voiceCallEndPayloadSchema>;

export const callEvalCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  agentPrompt: z.string().min(1),
  provenance: z.object({
    dataset: z.string().min(1),
    sourceId: z.string().min(1),
    sourceUrl: z.url(),
    license: z.literal('CC-BY-4.0'),
    taskType: z.string().min(1),
    callerPartnerRating: z.number().min(0).max(10).nullable(),
    taskSubmissionMatchesAssigned: z.boolean(),
  }),
  referenceTranscript: z.string().min(1),
  payload: voiceCallEndPayloadSchema,
  expectations: z.object({
    annotationStatus: z.literal('provisional_manual'),
    mustFlagChecks: z.array(z.string()),
    mustClearChecks: z.array(z.string()),
    mustRecommendTargets: z.array(z.string()).default([]),
    mustNotRecommendTargets: z.array(z.string()).default([]),
    rationale: z.string().min(1),
  }),
});

export const callEvalCorpusSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  description: z.string().min(1),
  provenance: z.object({
    dataset: z.string().min(1),
    repository: z.url(),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    license: z.literal('CC-BY-4.0'),
  }),
  cases: z.array(callEvalCaseSchema).min(1),
});

export type CallEvalCase = z.infer<typeof callEvalCaseSchema>;
export type CallEvalCorpus = z.infer<typeof callEvalCorpusSchema>;

export const callEvalReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  model: z.string().min(1),
  corpus: z.string().min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  scope: z.enum(['full', 'focused']).optional(),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      id: z.string().min(1),
      passed: z.boolean(),
      mismatches: z.array(z.string()),
      actual: z
        .object({
          outcome: z.enum(['success', 'partial', 'failure']),
          criteria: z.record(
            z.string(),
            z.enum(['clear', 'review', 'critical', 'not_applicable', 'not_observable']),
          ),
          recommendationTargets: z.array(z.string()),
        })
        .optional(),
    }),
  ),
});

export type CallEvalReport = z.infer<typeof callEvalReportSchema>;

export const pipelineAnalysisStatusSchema = z.enum([
  'not_queued',
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const pipelineAnalysisModeSchema = z.enum([
  'unassessed',
  'deterministic',
  'semantic',
  'mixed',
]);

export const pipelineCallSchema = z.object({
  id: z.string(),
  highLevelCallId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  createdAt: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  trialCall: z.boolean(),
  hasTranscript: z.boolean(),
  analysisStatus: pipelineAnalysisStatusSchema,
  analysisMode: pipelineAnalysisModeSchema.nullable(),
  analysisSummary: z.string().nullable(),
});

export const pipelineSummarySchema = z.object({
  agentsMonitored: z.number().int().nonnegative(),
  callsIngested: z.number().int().nonnegative(),
  analysesCompleted: z.number().int().nonnegative(),
  analysisMode: pipelineAnalysisModeSchema,
  lastSyncedAt: z.string().nullable(),
  calls: z.array(pipelineCallSchema),
});

export const pipelineSyncResponseSchema = pipelineSummarySchema.extend({
  syncedAgents: z.number().int().nonnegative(),
  syncedCalls: z.number().int().nonnegative(),
});

export type PipelineSummary = z.infer<typeof pipelineSummarySchema>;
export type PipelineSyncResponse = z.infer<typeof pipelineSyncResponseSchema>;

export const highLevelAuthStatusSchema = z.object({
  locationId: z.string(),
  marketplaceConfigured: z.boolean(),
  connected: z.boolean(),
  authMode: z.enum(['oauth', 'development_pit', 'none']),
  accessTokenExpiresAt: z.string().nullable(),
});

export type HighLevelAuthStatus = z.infer<typeof highLevelAuthStatusSchema>;

/**
 * Internal messages are deliberately identifier-only. Workers load protected call
 * content from PostgreSQL after re-establishing tenant context.
 */
export const tenantReferenceSchema = z.object({
  companyId: z.uuid().nullable(),
  locationId: z.uuid().nullable(),
});

export const domainEventMetadataSchema = z.object({
  messageId: z.uuid(),
  correlationId: z.uuid(),
  causationId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
  tenant: tenantReferenceSchema,
});

const ingestionRequestedDataSchema = z.object({
  webhookInboxId: z.uuid(),
  highLevelCallId: z.string().min(1),
});

const installationChangedDataSchema = z.object({
  installationId: z.uuid(),
});

const analysisRequestedDataSchema = z.object({
  callId: z.uuid(),
  agentId: z.uuid(),
  runReason: z
    .enum(['initial', 'retry', 'manual', 'criteria_change', 'backtest'])
    .default('initial'),
  requestKey: z.string().min(1).optional(),
  batchId: z.uuid().optional(),
});

export const callIngestionRequestedEventSchema = domainEventMetadataSchema
  .extend({
    type: z.literal('call.ingestion.requested'),
    version: z.literal(1),
    data: ingestionRequestedDataSchema,
  })
  .refine((event) => event.tenant.locationId !== null, {
    message: 'Call ingestion events require a location tenant.',
    path: ['tenant', 'locationId'],
  });

export const installationChangedEventSchema = domainEventMetadataSchema.extend({
  type: z.enum([
    'marketplace.installation.installed',
    'marketplace.installation.updated',
    'marketplace.installation.uninstalled',
  ]),
  version: z.literal(1),
  data: installationChangedDataSchema,
});

export const callAnalysisRequestedEventSchema = domainEventMetadataSchema
  .extend({
    type: z.literal('call.analysis.requested'),
    version: z.literal(1),
    data: analysisRequestedDataSchema,
  })
  .refine((event) => event.tenant.locationId !== null, {
    message: 'Call analysis events require a location tenant.',
    path: ['tenant', 'locationId'],
  });

export const domainEventSchema = z.union([
  callIngestionRequestedEventSchema,
  installationChangedEventSchema,
  callAnalysisRequestedEventSchema,
]);

export type TenantReference = z.infer<typeof tenantReferenceSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type CallIngestionRequestedEvent = z.infer<typeof callIngestionRequestedEventSchema>;
export type InstallationChangedEvent = z.infer<typeof installationChangedEventSchema>;
export type CallAnalysisRequestedEvent = z.infer<typeof callAnalysisRequestedEventSchema>;

export const criterionStatusSchema = z.enum(['pass', 'fail', 'not_applicable', 'unknown']);
export const criterionOriginSchema = z.enum([
  'universal',
  'prompt_generated',
  'user_defined',
  'configuration',
]);
export const criterionClassSchema = z.enum(['adherence', 'safety', 'outcome', 'diagnostic']);
export const evidenceCitationSchema = z.object({
  turnId: z.uuid(),
  turnOrdinal: z.number().int().positive(),
  speaker: z.enum(['agent', 'customer', 'unknown']),
  text: z.string().min(1),
});

export const recommendationSchema = z.object({
  id: z.uuid(),
  scope: z.enum(['call', 'agent']),
  criterionId: z.uuid(),
  criterionVersionId: z.uuid(),
  supportingCallCount: z.number().int().positive(),
  targetId: z.string(),
  type: z.literal('prompt'),
  title: z.string(),
  reason: z.string(),
  proposedChange: z.string(),
  uiPath: z.string().nullable(),
  evidenceTurnIds: z.array(z.uuid()),
});

export const agentAnalysisSummarySchema = z.object({
  callsAnalyzed: z.number().int().nonnegative(),
  averageDurationSeconds: z.number().nonnegative().nullable(),
  flaggedIssueCount: z.number().int().nonnegative(),
  callsWithFailures: z.number().int().nonnegative(),
});

export const dashboardAgentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  lifecycleState: z.string(),
  analysisStatus: z.enum(['not_analyzed', 'processing', 'completed', 'failed']),
  summary: agentAnalysisSummarySchema,
});

export const observabilityDashboardSchema = z.object({
  agents: z.array(dashboardAgentSchema),
});

export const agentConfigurationSnapshotSchema = z.object({
  id: z.uuid(),
  source: z.enum(['highlevel_api', 'user_supplemented', 'fixture']),
  sourceHash: z.string(),
  capturedAt: z.iso.datetime(),
  configuration: z.record(z.string(), z.unknown()),
  evidenceCapabilities: z.record(z.string(), z.unknown()),
});

export const successCriterionSchema = z.object({
  id: z.uuid(),
  stableKey: z.string(),
  origin: criterionOriginSchema,
  criterionClass: criterionClassSchema,
  lifecycleState: z.enum(['draft', 'active', 'retired']),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  naturalLanguageRule: z.string(),
  applicabilityDefinition: z.record(z.string(), z.unknown()),
  requiredEvidence: z.array(z.string()),
  resultDistribution: z.object({
    pass: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    notApplicable: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
});

export const agentCallListItemSchema = z.object({
  id: z.uuid(),
  highLevelCallId: z.string(),
  createdAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  analysisStatus: z.enum(['queued', 'processing', 'completed', 'failed']),
  flaggedIssueCount: z.number().int().nonnegative(),
  failedCriterionVersionIds: z.array(z.uuid()),
});

export const agentCallPageSchema = z.object({
  items: z.array(agentCallListItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
});

export const agentCallPageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const agentAnalysisDetailSchema = z.object({
  agent: z.object({
    id: z.uuid(),
    name: z.string(),
    lifecycleState: z.string(),
  }),
  summary: agentAnalysisSummarySchema,
  activeConfiguration: agentConfigurationSnapshotSchema.nullable(),
  successCriteria: z.array(successCriterionSchema),
  recommendations: z.array(recommendationSchema),
  calls: z.array(agentCallListItemSchema),
  nextCallCursor: z.string().nullable(),
  totalCallCount: z.number().int().nonnegative(),
});

export const transcriptTurnSchema = z.object({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  speaker: z.enum(['agent', 'customer', 'unknown']),
  text: z.string(),
  sourceStartMs: z.number().int().nonnegative().nullable(),
  sourceEndMs: z.number().int().nonnegative().nullable(),
});

export const criterionResultSchema = z.object({
  id: z.uuid(),
  criterionId: z.uuid(),
  criterionVersionId: z.uuid(),
  stableKey: z.string(),
  title: z.string(),
  origin: criterionOriginSchema,
  criterionClass: criterionClassSchema,
  result: criterionStatusSchema,
  rationale: z.string(),
  evidence: z.array(evidenceCitationSchema),
});

export const callAnalysisDetailSchema = z.object({
  call: z.object({
    id: z.uuid(),
    highLevelCallId: z.string(),
    agentId: z.uuid(),
    agentName: z.string(),
    createdAt: z.iso.datetime(),
    durationSeconds: z.number().int().nonnegative(),
    direction: z.string().nullable(),
    sourceSummary: z.string().nullable(),
    extractedData: z.record(z.string(), z.unknown()),
    turns: z.array(transcriptTurnSchema),
    actionEvents: z.array(
      z.object({
        id: z.uuid(),
        ordinal: z.number().int().positive(),
        actionType: z.string().nullable(),
        actionName: z.string().nullable(),
        outcome: z.string().nullable(),
        resultSummary: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  analysis: z
    .object({
      id: z.uuid(),
      runSequence: z.number().int().positive(),
      runReason: z.string(),
      status: z.enum(['queued', 'processing', 'completed', 'failed']),
      model: z.string().nullable(),
      provider: z.string().nullable(),
      evaluatorVersion: z.string(),
      completedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  configuration: agentConfigurationSnapshotSchema,
  criterionResults: z.array(criterionResultSchema),
  recommendations: z.array(recommendationSchema),
});

export const callReanalysisResponseSchema = z.object({
  requestId: z.uuid(),
  status: z.literal('queued'),
});

export const agentReanalysisWindowSchema = z.enum(['24h', '7d']);

export const agentReanalysisRequestSchema = z.object({
  window: agentReanalysisWindowSchema,
});

export const agentReanalysisResponseSchema = z.object({
  batchRequestId: z.uuid(),
  window: agentReanalysisWindowSchema,
  matchedCallCount: z.number().int().nonnegative(),
  queuedCallCount: z.number().int().nonnegative(),
  status: z.enum(['queued', 'no_calls']),
});

export const analysisBatchStatusSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  window: agentReanalysisWindowSchema,
  status: z.enum(['queued', 'processing', 'completed', 'partial_failed']),
  totalCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const successCriterionDraftRequestSchema = z.object({
  naturalLanguageRule: z.string().trim().min(10).max(2_000),
});

export const successCriterionDraftResponseSchema = z.object({
  criterion: successCriterionSchema.omit({ resultDistribution: true }),
  warnings: z.array(z.string()),
});

export const successCriterionActivationResponseSchema = z.object({
  criterion: successCriterionSchema.omit({ resultDistribution: true }),
  criterionSet: z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    fingerprint: z.string(),
  }),
  reanalysisQueued: z.number().int().nonnegative(),
});

export type CriterionStatus = z.infer<typeof criterionStatusSchema>;
export type EvidenceCitation = z.infer<typeof evidenceCitationSchema>;
export type AgentAnalysisSummary = z.infer<typeof agentAnalysisSummarySchema>;
export type ObservabilityDashboard = z.infer<typeof observabilityDashboardSchema>;
export type AgentAnalysisDetail = z.infer<typeof agentAnalysisDetailSchema>;
export type AgentCallPage = z.infer<typeof agentCallPageSchema>;
export type CallAnalysisDetail = z.infer<typeof callAnalysisDetailSchema>;
export type CallReanalysisResponse = z.infer<typeof callReanalysisResponseSchema>;
export type AgentReanalysisWindow = z.infer<typeof agentReanalysisWindowSchema>;
export type AgentReanalysisResponse = z.infer<typeof agentReanalysisResponseSchema>;
export type AnalysisBatchStatus = z.infer<typeof analysisBatchStatusSchema>;
export type SuccessCriterion = z.infer<typeof successCriterionSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;

/**
 * Converts legacy, meta-level prompt advice into text that can be pasted directly into
 * an agent prompt. New evaluations are required to produce paste-ready text already;
 * this remains as a compatibility boundary for recommendations created before that
 * contract existed.
 */
export function pasteReadyRecommendationChange(
  recommendation: Pick<Recommendation, 'type' | 'proposedChange'>,
): string {
  const original = recommendation.proposedChange.trim();
  if (recommendation.type !== 'prompt' || !original) return original;

  let value = original;
  let removedMetaInstruction = false;
  const metaInstructionPrefixes = [
    /^(?:explicitly\s+)?instruct\s+(?:the\s+)?(?:voice\s+)?agent\s+to\s+/i,
    /^(?:add|include|insert)(?:\s+or\s+reinforce)?\s+(?:a|an)?\s*(?:core\s+)?(?:prompt\s+)?(?:instruction|rule|guidance)(?:\s+for\s+[^:]+)?(?:\s+that|\s+to|\s*:)\s*/i,
    /^(?:update|revise|edit|change|strengthen|clarify)\s+(?:the\s+)?(?:voice\s+agent\s+|agent\s+)?prompt\s+(?:to|so\s+that|with)\s+/i,
    /^(?:the\s+)?(?:voice\s+agent\s+|agent\s+)?prompt\s+should\s+(?:say|state|require|instruct(?:\s+(?:the\s+)?(?:voice\s+)?agent)?\s+to)\s+/i,
  ];

  for (const prefix of metaInstructionPrefixes) {
    const next = value.replace(prefix, '');
    if (next !== value) {
      value = next;
      removedMetaInstruction = true;
      break;
    }
  }

  if (!removedMetaInstruction) return original;

  value = value
    .replace(/^that\s+/i, '')
    .replace(/^require\s+(?:that\s+)?(?:the\s+)?(?:voice\s+)?agent\s+to\s+/i, 'You must ')
    .replace(/^(?:the\s+)?(?:voice\s+)?agent\s+(must|should|cannot|can|will)\b/i, 'You $1')
    .replace(/^say\s+it\b/i, 'Say you')
    .replace(/\bthe Voice Agent\b/g, 'you')
    .replace(/\bthe voice agent\b/g, 'you')
    .replace(/\bthe agent\b/g, 'you')
    .replace(/\bit (must|should|cannot|can|will)\b/g, 'you $1')
    .replace(/([,;])\s+(and|or)\s+to\s+/gi, '$1 $2 ')
    .trim();

  return value.replace(/^./, (character) => character.toUpperCase());
}
