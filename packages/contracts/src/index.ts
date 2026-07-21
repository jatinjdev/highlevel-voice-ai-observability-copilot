import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

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

export const agentDiscoveryResponseSchema = z.object({
  discoveredAgentCount: z.number().int().nonnegative(),
});

export type AgentDiscoveryResponse = z.infer<typeof agentDiscoveryResponseSchema>;

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

const analysisRequestedDataSchema = z.object({
  callId: z.uuid(),
  agentId: z.uuid(),
  runReason: z.enum(['initial', 'manual', 'criteria_change']).default('initial'),
  requestKey: z.string().min(1).optional(),
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
  callAnalysisRequestedEventSchema,
  criterionRecommendationRequestedEventSchema,
]);

export type TenantReference = z.infer<typeof tenantReferenceSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type CallIngestionRequestedEvent = z.infer<typeof callIngestionRequestedEventSchema>;
export type CallAnalysisRequestedEvent = z.infer<typeof callAnalysisRequestedEventSchema>;
export type CriterionRecommendationRequestedEvent = z.infer<
  typeof criterionRecommendationRequestedEventSchema
>;

export function normalizeCriterionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export interface DefaultSuccessCriterion {
  name: string;
  description: string;
}

export const DEFAULT_SUCCESS_CRITERIA: readonly DefaultSuccessCriterion[] = [
  {
    name: 'Customer outcome',
    description:
      "For a substantive customer call, the agent must resolve the caller's actual request, materially advance it, or establish a clear and honest next step. Mark not applicable for calls without a substantive request.",
  },
  {
    name: 'Safe and trustworthy behavior',
    description:
      'The agent must avoid hostile, deceptive, discriminatory, unsafe, fabricated, privacy-invasive, or unjustifiably certain claims. Fail only for an observable breach in the call evidence.',
  },
  {
    name: 'Agent-caused frustration',
    description:
      'The agent must not cause or worsen frustration by ignoring, contradicting, needlessly repeating, or mishandling the caller. Do not fail for negative emotion that existed before the agent response.',
  },
  {
    name: 'Listening and context retention',
    description:
      'When the caller supplies facts or answers questions, the agent must retain that context and avoid making the caller repeat information that was ignored. Mark not applicable when there is no information to retain.',
  },
  {
    name: 'Relevance and clarity',
    description:
      'For each substantive exchange, the agent must respond directly and clearly without confusing, evasive, or needless repetition. Harmless stylistic differences pass.',
  },
  {
    name: 'Appropriate empathy',
    description:
      'When the caller expresses distress, anger, loss, or inconvenience, the agent must appropriately acknowledge it. Mark not applicable for routine calls where empathy is not called for.',
  },
  {
    name: 'Grounding and uncertainty',
    description:
      'When supplying factual information, the agent must not invent business facts and must communicate uncertainty honestly when the answer is not supported by the call evidence.',
  },
  {
    name: 'Escalation judgment',
    description:
      'When resolution is impossible, unsupported, or high-risk, the agent must establish an appropriate human next step. Mark not applicable when escalation is unnecessary.',
  },
];

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
  capabilityId: z.string(),
  capabilityLabel: z.string(),
  uiPath: z.string(),
  advice: z.string(),
  promptRemovals: z.array(z.string()).max(3),
  promptAddition: z.string().nullable(),
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

export const callAnalysisStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);

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
  analysisStatus: callAnalysisStatusSchema,
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

export const callOverviewSchema = z.object({
  intent: z.string(),
  outcome: z.enum(['resolved', 'partially_resolved', 'unresolved', 'not_applicable', 'unknown']),
  sentiment: z.object({
    label: z.enum(['positive', 'neutral', 'negative', 'mixed', 'unknown']),
    rationale: z.string(),
  }),
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
  analysisStatus: callAnalysisStatusSchema,
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
  overview: callOverviewSchema.nullable(),
  successCriteria: z.array(successCriterionSchema.omit({ resultDistribution: true })),
  criterionResults: z.array(criterionResultSchema),
});

export const callAnalysisRequestResponseSchema = z.object({
  requestId: z.uuid(),
  status: z.literal('queued'),
});

export const agentAnalysisWindowSchema = z.enum(['24h', '7d']);

export const agentAnalysisRequestSchema = z.object({
  window: agentAnalysisWindowSchema,
});

export const agentAnalysisRequestResponseSchema = z.object({
  requestId: z.uuid(),
  window: agentAnalysisWindowSchema,
  discoveredCallCount: z.number().int().nonnegative(),
  queuedCallCount: z.number().int().nonnegative(),
  status: z.enum(['queued', 'no_calls']),
});

export const MAX_SUCCESS_CRITERIA_PER_AGENT = 20;
export const createSuccessCriterionRequestSchema = z.object({
  name: z.string().trim().min(2).max(96),
  description: z.string().trim().min(10).max(2_000),
});

export const successCriterionMutationResponseSchema = z.object({
  criterion: successCriterionSchema.omit({ resultDistribution: true }),
});

export const recommendationBatchResponseSchema = z.object({
  batchId: z.uuid(),
  criterionIds: z.array(z.uuid()),
  queuedCriterionCount: z.number().int().nonnegative(),
  status: z.enum(['queued', 'no_failures']),
});

export type CriterionStatus = z.infer<typeof criterionStatusSchema>;
export type EvidenceCitation = z.infer<typeof evidenceCitationSchema>;
export type AgentAnalysisSummary = z.infer<typeof agentAnalysisSummarySchema>;
export type ObservabilityDashboard = z.infer<typeof observabilityDashboardSchema>;
export type AgentAnalysisDetail = z.infer<typeof agentAnalysisDetailSchema>;
export type AgentCallPage = z.infer<typeof agentCallPageSchema>;
export type CallAnalysisDetail = z.infer<typeof callAnalysisDetailSchema>;
export type CallAnalysisRequestResponse = z.infer<typeof callAnalysisRequestResponseSchema>;
export type AgentAnalysisWindow = z.infer<typeof agentAnalysisWindowSchema>;
export type AgentAnalysisRequestResponse = z.infer<typeof agentAnalysisRequestResponseSchema>;
export type SuccessCriterion = z.infer<typeof successCriterionSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type RecommendationGenerationStatus = z.infer<typeof recommendationGenerationStatusSchema>;
export type RecommendationBatchResponse = z.infer<typeof recommendationBatchResponseSchema>;
