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

const recommendationRequestedDataSchema = z.object({
  requestId: z.uuid(),
  agentId: z.uuid(),
  criterionId: z.uuid(),
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

export const criterionRecommendationRequestedEventSchema = domainEventMetadataSchema
  .extend({
    type: z.literal('criterion.recommendation.requested'),
    version: z.literal(1),
    data: recommendationRequestedDataSchema,
  })
  .refine((event) => event.tenant.locationId !== null, {
    message: 'Recommendation events require a location tenant.',
    path: ['tenant', 'locationId'],
  });

export const domainEventSchema = z.union([
  callIngestionRequestedEventSchema,
  installationChangedEventSchema,
  callAnalysisRequestedEventSchema,
  criterionRecommendationRequestedEventSchema,
]);

export type TenantReference = z.infer<typeof tenantReferenceSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type CallIngestionRequestedEvent = z.infer<typeof callIngestionRequestedEventSchema>;
export type InstallationChangedEvent = z.infer<typeof installationChangedEventSchema>;
export type CallAnalysisRequestedEvent = z.infer<typeof callAnalysisRequestedEventSchema>;
export type CriterionRecommendationRequestedEvent = z.infer<
  typeof criterionRecommendationRequestedEventSchema
>;

export function normalizeCriterionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export const criterionStatusSchema = z.enum(['pass', 'fail', 'not_applicable', 'unknown']);
export const evidenceCitationSchema = z.object({
  turnId: z.uuid(),
  turnOrdinal: z.number().int().positive(),
  speaker: z.enum(['agent', 'customer', 'unknown']),
  text: z.string().min(1),
});

export const actionEvidenceCitationSchema = z.object({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  actionName: z.string().nullable(),
  outcome: z.string().nullable(),
});

export const recommendationSchema = z.object({
  id: z.uuid(),
  criterionId: z.uuid(),
  criterionName: z.string(),
  headline: z.string(),
  explanation: z.string(),
  promptAddition: z.string(),
  affectedCallCount: z.number().int().nonnegative(),
  sampledFailureCount: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});

export const recommendationGenerationStatusSchema = z.object({
  criterionId: z.uuid(),
  status: z.enum(['idle', 'queued', 'processing', 'completed', 'not_needed', 'failed']),
  lastError: z.string().nullable(),
  requestedAt: z.iso.datetime().nullable(),
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

export const agentConfigurationSchema = z.object({
  currentPrompt: z.string().nullable(),
  promptHash: z.string().nullable(),
  syncStatus: z.string(),
  syncedAt: z.iso.datetime().nullable(),
  configuration: z.record(z.string(), z.unknown()),
});

export const successCriterionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  source: z.enum(['default', 'user']),
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
  failedCriterionIds: z.array(z.uuid()),
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
  configuration: agentConfigurationSchema.nullable(),
  successCriteria: z.array(successCriterionSchema),
  recommendations: z.array(recommendationSchema),
  recommendationStatuses: z.array(recommendationGenerationStatusSchema),
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
  criterionName: z.string(),
  criterionDescription: z.string(),
  result: criterionStatusSchema,
  rationale: z.string(),
  evidence: z.array(evidenceCitationSchema),
  actionEvidence: z.array(actionEvidenceCitationSchema),
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
  criterionResults: z.array(criterionResultSchema),
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

export const createSuccessCriterionRequestSchema = z.object({
  name: z.string().trim().min(2).max(96),
  description: z.string().trim().min(10).max(2_000),
});

export const updateSuccessCriterionRequestSchema = z.object({
  description: z.string().trim().min(10).max(2_000),
});

export const successCriterionMutationResponseSchema = z.object({
  criterion: successCriterionSchema.omit({ resultDistribution: true }),
  reanalysisQueued: z.number().int().nonnegative(),
});

export const recommendationGenerationResponseSchema = z.object({
  requestId: z.uuid(),
  criterionId: z.uuid(),
  status: z.literal('queued'),
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
export type RecommendationGenerationStatus = z.infer<typeof recommendationGenerationStatusSchema>;
export type RecommendationGenerationResponse = z.infer<
  typeof recommendationGenerationResponseSchema
>;
