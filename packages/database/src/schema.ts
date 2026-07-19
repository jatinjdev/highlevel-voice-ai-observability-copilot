import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    highLevelCompanyId: varchar('highlevel_company_id', { length: 64 }).notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('companies_highlevel_id_idx').on(table.highLevelCompanyId)],
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    highLevelLocationId: varchar('highlevel_location_id', { length: 64 }).notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('locations_highlevel_id_idx').on(table.highLevelLocationId),
    index('locations_company_id_idx').on(table.companyId),
  ],
);

export const marketplaceAppInstallations = pgTable(
  'marketplace_app_installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationKey: varchar('installation_key', { length: 196 }).notNull(),
    appId: varchar('app_id', { length: 64 }).notNull(),
    subjectType: varchar('subject_type', { length: 24 }).notNull(),
    subjectExternalId: varchar('subject_external_id', { length: 64 }).notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    installerUserId: varchar('installer_user_id', { length: 64 }),
    status: varchar('status', { length: 24 }).default('provisional').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('marketplace_app_installations_key_idx').on(table.installationKey),
    index('marketplace_app_installations_company_idx').on(table.companyId),
  ],
);

export const marketplaceUsers = pgTable(
  'marketplace_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    highLevelUserId: varchar('highlevel_user_id', { length: 64 }).notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    name: text('name'),
    email: text('email'),
    role: varchar('role', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('marketplace_users_highlevel_id_idx').on(table.highLevelUserId)],
);

export const appSessions = pgTable(
  'app_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => marketplaceUsers.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_sessions_token_hash_idx').on(table.tokenHash),
    index('app_sessions_user_idx').on(table.userId, table.expiresAt),
  ],
);

export const installationLocationGrants = pgTable(
  'installation_location_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => marketplaceAppInstallations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 24 }).default('active').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('installation_location_grants_installation_location_idx').on(
      table.installationId,
      table.locationId,
    ),
    index('installation_location_grants_location_idx').on(table.locationId),
  ],
);

export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
    appId: varchar('app_id', { length: 64 }),
    webhookId: varchar('webhook_id', { length: 128 }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payloadSha256: varchar('payload_sha256', { length: 64 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 24 }).default('received').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('webhook_inbox_idempotency_key_idx').on(table.idempotencyKey),
    index('webhook_inbox_event_type_idx').on(table.eventType),
    index('webhook_inbox_received_at_idx').on(table.receivedAt),
  ],
);

export const messageOutbox = pgTable(
  'message_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceInboxId: uuid('source_inbox_id')
      .notNull()
      .references(() => webhookInbox.id, { onDelete: 'restrict' }),
    eventType: varchar('event_type', { length: 96 }).notNull(),
    schemaVersion: integer('schema_version').default(1).notNull(),
    aggregateType: varchar('aggregate_type', { length: 48 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    causationId: uuid('causation_id'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    nextPublishAt: timestamp('next_publish_at', { withTimezone: true }).defaultNow().notNull(),
    leaseToken: uuid('lease_token'),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    publishAttempts: integer('publish_attempts').default(0).notNull(),
    lastPublishError: text('last_publish_error'),
  },
  (table) => [
    uniqueIndex('message_outbox_source_event_idx').on(table.sourceInboxId, table.eventType),
    index('message_outbox_unpublished_idx').on(
      table.publishedAt,
      table.nextPublishAt,
      table.leasedUntil,
    ),
  ],
);

export const processedMessages = pgTable(
  'processed_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    consumerName: varchar('consumer_name', { length: 64 }).notNull(),
    messageId: uuid('message_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('processed_messages_consumer_message_idx').on(table.consumerName, table.messageId),
    index('processed_messages_processed_at_idx').on(table.processedAt),
  ],
);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobKey: varchar('job_key', { length: 240 }).notNull(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => marketplaceAppInstallations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    kind: varchar('kind', { length: 32 }).notNull(),
    status: varchar('status', { length: 24 }).default('pending').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('ingestion_jobs_key_idx').on(table.jobKey),
    index('ingestion_jobs_pending_idx').on(table.status, table.requestedAt),
  ],
);

export const voiceAgents = pgTable(
  'voice_agents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    highLevelAgentId: varchar('highlevel_agent_id', { length: 64 }).notNull(),
    name: text('name').notNull(),
    lifecycleState: varchar('lifecycle_state', { length: 24 }).default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('voice_agents_location_highlevel_idx').on(table.locationId, table.highLevelAgentId),
    index('voice_agents_location_state_idx').on(table.locationId, table.lifecycleState),
  ],
);

export const agentConfigSnapshots = pgTable(
  'agent_config_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    sourceHash: varchar('source_hash', { length: 64 }).notNull(),
    source: varchar('source', { length: 24 }).notNull(),
    configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
    evidenceCapabilities: jsonb('evidence_capabilities').$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('agent_config_snapshots_agent_hash_idx').on(table.agentId, table.sourceHash),
    index('agent_config_snapshots_agent_valid_idx').on(table.agentId, table.validTo),
  ],
);

export const successCriteria = pgTable(
  'success_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    stableKey: varchar('stable_key', { length: 96 }).notNull(),
    origin: varchar('origin', { length: 32 }).notNull(),
    criterionClass: varchar('criterion_class', { length: 24 }).notNull(),
    lifecycleState: varchar('lifecycle_state', { length: 24 }).default('draft').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => marketplaceUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('success_criteria_agent_key_idx').on(table.agentId, table.stableKey),
    index('success_criteria_agent_state_idx').on(table.agentId, table.lifecycleState),
  ],
);

export const successCriterionVersions = pgTable(
  'success_criterion_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => successCriteria.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    naturalLanguageRule: text('natural_language_rule').notNull(),
    applicabilityDefinition: jsonb('applicability_definition')
      .$type<Record<string, unknown>>()
      .notNull(),
    evaluationInstructions: text('evaluation_instructions').notNull(),
    requiredEvidence: jsonb('required_evidence').$type<string[]>().default([]).notNull(),
    severityPolicy: jsonb('severity_policy').$type<Record<string, unknown>>().notNull(),
    sourceReferences: jsonb('source_references').$type<string[]>().default([]).notNull(),
    allowedRecommendationTargetIds: text('allowed_recommendation_target_ids')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    compilerVersion: varchar('compiler_version', { length: 48 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('success_criterion_versions_criterion_version_idx').on(
      table.criterionId,
      table.version,
    ),
  ],
);

export const criterionSets = pgTable(
  'criterion_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    active: boolean('active').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('criterion_sets_agent_version_idx').on(table.agentId, table.version),
    uniqueIndex('criterion_sets_agent_fingerprint_idx').on(table.agentId, table.fingerprint),
    uniqueIndex('criterion_sets_one_active_idx')
      .on(table.agentId)
      .where(sql`${table.active} = true`),
  ],
);

export const criterionSetMembers = pgTable(
  'criterion_set_members',
  {
    criterionSetId: uuid('criterion_set_id')
      .notNull()
      .references(() => criterionSets.id, { onDelete: 'cascade' }),
    criterionVersionId: uuid('criterion_version_id')
      .notNull()
      .references(() => successCriterionVersions.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.criterionSetId, table.criterionVersionId] }),
    uniqueIndex('criterion_set_members_order_idx').on(table.criterionSetId, table.displayOrder),
  ],
);

export const analysisReleases = pgTable(
  'analysis_releases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    releaseKey: varchar('release_key', { length: 64 }).notNull(),
    version: varchar('version', { length: 64 }).notNull(),
    semanticPromptVersion: varchar('semantic_prompt_version', { length: 64 }).notNull(),
    evaluatorVersion: varchar('evaluator_version', { length: 64 }).notNull(),
    deterministicEvaluatorVersion: varchar('deterministic_evaluator_version', {
      length: 64,
    }).notNull(),
    criterionCompilerVersion: varchar('criterion_compiler_version', { length: 64 }).notNull(),
    recommendationCatalogueVersion: varchar('recommendation_catalogue_version', {
      length: 48,
    }).notNull(),
    outputSchemaVersion: integer('output_schema_version').notNull(),
    provider: varchar('provider', { length: 48 }),
    model: varchar('model', { length: 128 }),
    modelParameters: jsonb('model_parameters')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('analysis_releases_key_idx').on(table.releaseKey),
    index('analysis_releases_version_idx').on(table.version),
  ],
);

export const voiceCalls = pgTable(
  'voice_calls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    agentConfigSnapshotId: uuid('agent_config_snapshot_id')
      .notNull()
      .references(() => agentConfigSnapshots.id, { onDelete: 'restrict' }),
    sourceWebhookInboxId: uuid('source_webhook_inbox_id').references(() => webhookInbox.id, {
      onDelete: 'restrict',
    }),
    highLevelCallId: varchar('highlevel_call_id', { length: 64 }).notNull(),
    contactId: varchar('contact_id', { length: 64 }),
    direction: varchar('direction', { length: 16 }),
    sourceTranscript: text('source_transcript').notNull(),
    sourceSummary: text('source_summary'),
    durationSeconds: integer('duration_seconds').notNull(),
    extractedData: jsonb('extracted_data').$type<Record<string, unknown>>().default({}).notNull(),
    isTrial: boolean('is_trial').default(false).notNull(),
    callCreatedAt: timestamp('call_created_at', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('voice_calls_location_highlevel_idx').on(table.locationId, table.highLevelCallId),
    index('voice_calls_agent_created_idx').on(table.agentId, table.callCreatedAt),
  ],
);

export const callTurns = pgTable(
  'call_turns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    callId: uuid('call_id')
      .notNull()
      .references(() => voiceCalls.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    speaker: varchar('speaker', { length: 16 }).notNull(),
    text: text('text').notNull(),
    sourceStartMs: integer('source_start_ms'),
    sourceEndMs: integer('source_end_ms'),
  },
  (table) => [
    uniqueIndex('call_turns_call_ordinal_idx').on(table.callId, table.ordinal),
    index('call_turns_call_idx').on(table.callId),
  ],
);

export const callActionEvents = pgTable(
  'call_action_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    callId: uuid('call_id')
      .notNull()
      .references(() => voiceCalls.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    highLevelActionId: varchar('highlevel_action_id', { length: 64 }),
    actionType: varchar('action_type', { length: 48 }),
    actionName: text('action_name'),
    outcome: varchar('outcome', { length: 24 }),
    resultSummary: jsonb('result_summary').$type<Record<string, unknown>>().default({}).notNull(),
    sourceOccurredAt: timestamp('source_occurred_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('call_action_events_call_ordinal_idx').on(table.callId, table.ordinal)],
);

export const callAnalysisRuns = pgTable(
  'call_analysis_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    callId: uuid('call_id')
      .notNull()
      .references(() => voiceCalls.id, { onDelete: 'cascade' }),
    configSnapshotId: uuid('config_snapshot_id')
      .notNull()
      .references(() => agentConfigSnapshots.id, { onDelete: 'restrict' }),
    criterionSetId: uuid('criterion_set_id')
      .notNull()
      .references(() => criterionSets.id, { onDelete: 'restrict' }),
    analysisReleaseId: uuid('analysis_release_id')
      .notNull()
      .references(() => analysisReleases.id, { onDelete: 'restrict' }),
    runSequence: integer('run_sequence').notNull(),
    runReason: varchar('run_reason', { length: 24 }).default('initial').notNull(),
    inputFingerprint: varchar('input_fingerprint', { length: 64 }).notNull(),
    executionKey: varchar('execution_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).default('queued').notNull(),
    provider: varchar('provider', { length: 48 }),
    model: varchar('model', { length: 128 }),
    modelParameters: jsonb('model_parameters')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    evaluatorVersion: varchar('evaluator_version', { length: 48 }).notNull(),
    outputSchemaVersion: integer('output_schema_version').default(1).notNull(),
    codeVersion: varchar('code_version', { length: 64 }),
    isCurrent: boolean('is_current').default(false).notNull(),
    leaseToken: uuid('lease_token'),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('call_analysis_runs_call_sequence_idx').on(table.callId, table.runSequence),
    uniqueIndex('call_analysis_runs_call_execution_idx').on(table.callId, table.executionKey),
    uniqueIndex('call_analysis_runs_one_current_idx')
      .on(table.callId)
      .where(sql`${table.isCurrent} = true`),
    index('call_analysis_runs_call_input_idx').on(table.callId, table.inputFingerprint),
    index('call_analysis_runs_status_lease_idx').on(table.status, table.leasedUntil),
  ],
);

export const criterionResults = pgTable(
  'criterion_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisRunId: uuid('analysis_run_id')
      .notNull()
      .references(() => callAnalysisRuns.id, { onDelete: 'cascade' }),
    criterionVersionId: uuid('criterion_version_id')
      .notNull()
      .references(() => successCriterionVersions.id, { onDelete: 'restrict' }),
    result: varchar('result', { length: 24 }).notNull(),
    rationale: text('rationale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('criterion_results_run_criterion_idx').on(
      table.analysisRunId,
      table.criterionVersionId,
    ),
    index('criterion_results_result_idx').on(table.result),
  ],
);

export const criterionResultEvidence = pgTable(
  'criterion_result_evidence',
  {
    criterionResultId: uuid('criterion_result_id')
      .notNull()
      .references(() => criterionResults.id, { onDelete: 'cascade' }),
    callTurnId: uuid('call_turn_id')
      .notNull()
      .references(() => callTurns.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.criterionResultId, table.callTurnId] })],
);

export const analysisBatches = pgTable(
  'analysis_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    window: varchar('window', { length: 16 }).notNull(),
    status: varchar('status', { length: 24 }).default('queued').notNull(),
    totalCount: integer('total_count').default(0).notNull(),
    completedCount: integer('completed_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('analysis_batches_agent_requested_idx').on(table.agentId, table.requestedAt)],
);

export const analysisBatchItems = pgTable(
  'analysis_batch_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => analysisBatches.id, { onDelete: 'cascade' }),
    callId: uuid('call_id')
      .notNull()
      .references(() => voiceCalls.id, { onDelete: 'cascade' }),
    requestKey: varchar('request_key', { length: 160 }).notNull(),
    status: varchar('status', { length: 24 }).default('queued').notNull(),
    analysisRunId: uuid('analysis_run_id').references(() => callAnalysisRuns.id, {
      onDelete: 'set null',
    }),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('analysis_batch_items_batch_call_idx').on(table.batchId, table.callId),
    uniqueIndex('analysis_batch_items_request_key_idx').on(table.requestKey),
    index('analysis_batch_items_batch_status_idx').on(table.batchId, table.status),
  ],
);

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => voiceAgents.id, { onDelete: 'cascade' }),
    criterionResultId: uuid('criterion_result_id')
      .notNull()
      .references(() => criterionResults.id, { onDelete: 'cascade' }),
    targetId: varchar('target_id', { length: 128 }).notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    title: text('title').notNull(),
    reason: text('reason').notNull(),
    proposedChange: text('proposed_change').notNull(),
    uiPath: text('ui_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('recommendations_agent_idx').on(table.agentId),
    uniqueIndex('recommendations_result_target_idx').on(table.criterionResultId, table.targetId),
  ],
);

export const marketplaceInstallations = pgTable(
  'marketplace_installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    locationId: varchar('location_id', { length: 64 }).notNull(),
    companyId: varchar('company_id', { length: 64 }),
    userId: varchar('user_id', { length: 64 }).notNull(),
    userType: varchar('user_type', { length: 24 }).notNull(),
    tokenType: varchar('token_type', { length: 24 }).default('Bearer').notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('marketplace_installations_location_id_idx').on(table.locationId)],
);

export const voiceAgentsRelations = relations(voiceAgents, ({ one, many }) => ({
  location: one(locations, { fields: [voiceAgents.locationId], references: [locations.id] }),
  configSnapshots: many(agentConfigSnapshots),
  criteria: many(successCriteria),
  criterionSets: many(criterionSets),
  calls: many(voiceCalls),
}));
export const voiceCallsRelations = relations(voiceCalls, ({ one, many }) => ({
  agent: one(voiceAgents, { fields: [voiceCalls.agentId], references: [voiceAgents.id] }),
  location: one(locations, { fields: [voiceCalls.locationId], references: [locations.id] }),
  configSnapshot: one(agentConfigSnapshots, {
    fields: [voiceCalls.agentConfigSnapshotId],
    references: [agentConfigSnapshots.id],
  }),
  turns: many(callTurns),
  actionEvents: many(callActionEvents),
  analyses: many(callAnalysisRuns),
}));
export const callAnalysisRunsRelations = relations(callAnalysisRuns, ({ one, many }) => ({
  call: one(voiceCalls, { fields: [callAnalysisRuns.callId], references: [voiceCalls.id] }),
  configSnapshot: one(agentConfigSnapshots, {
    fields: [callAnalysisRuns.configSnapshotId],
    references: [agentConfigSnapshots.id],
  }),
  criterionSet: one(criterionSets, {
    fields: [callAnalysisRuns.criterionSetId],
    references: [criterionSets.id],
  }),
  analysisRelease: one(analysisReleases, {
    fields: [callAnalysisRuns.analysisReleaseId],
    references: [analysisReleases.id],
  }),
  criterionResults: many(criterionResults),
}));
export const companiesRelations = relations(companies, ({ many }) => ({
  locations: many(locations),
  installations: many(marketplaceAppInstallations),
}));
export const locationsRelations = relations(locations, ({ one, many }) => ({
  company: one(companies, { fields: [locations.companyId], references: [companies.id] }),
  installationGrants: many(installationLocationGrants),
  voiceAgents: many(voiceAgents),
  voiceCalls: many(voiceCalls),
}));
export const marketplaceAppInstallationsRelations = relations(
  marketplaceAppInstallations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [marketplaceAppInstallations.companyId],
      references: [companies.id],
    }),
    locationGrants: many(installationLocationGrants),
  }),
);
export const installationLocationGrantsRelations = relations(
  installationLocationGrants,
  ({ one }) => ({
    installation: one(marketplaceAppInstallations, {
      fields: [installationLocationGrants.installationId],
      references: [marketplaceAppInstallations.id],
    }),
    location: one(locations, {
      fields: [installationLocationGrants.locationId],
      references: [locations.id],
    }),
  }),
);
