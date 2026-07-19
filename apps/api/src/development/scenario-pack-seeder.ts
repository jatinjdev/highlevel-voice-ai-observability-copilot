import type { VoiceCallEndPayload } from '@copilot/contracts';
import {
  agentConfigSnapshots,
  locations,
  messageOutbox,
  successCriteria,
  successCriterionVersions,
  voiceAgents,
  webhookInbox,
} from '@copilot/database';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { compileUserCriterion } from '../observability/user-criterion-compiler';

export interface ScenarioCallPayload {
  id: string;
  duration: number;
  summary?: string;
  transcript: string;
  translation?: Record<string, unknown> | null;
  extractedData?: Record<string, unknown>;
  executedCallActions?: unknown[];
}

export interface EvaluationScenarioPack {
  version: string;
  agent: {
    highLevelAgentId: string;
    name: string;
    prompt: string;
    userDefinedCriteria?: Array<{ id: string; rule: string }>;
  };
  expectations?: {
    calls: Record<
      string,
      {
        outcome: 'success' | 'partial' | 'failure';
        mustFlagCriterionKeys: string[];
        mustRecommendTargets: string[];
        mustRecommendForCriterionKeys?: string[];
        mustNotRecommendTargets?: string[];
        minimumRecommendations?: number;
        mustRecommendTargetPrefixes?: string[];
        mustNotRecommendTargetPrefixes?: string[];
      }
    >;
    agent: {
      minimumFlaggedCalls: number;
      repeatedCriterionKeys: string[];
      mustRecommendTargets: string[];
      mustNotRecommendTargets?: string[];
      minimumRecommendations?: number;
      mustRecommendTargetPrefixes?: string[];
      mustNotRecommendTargetPrefixes?: string[];
    };
  };
  calls: Array<{
    name: string;
    payload: ScenarioCallPayload;
    fixtureMetadata?: Record<string, unknown>;
  }>;
}

export interface SeedScenarioPackResult {
  queued: number;
  skipped: number;
  criteriaActivated: number;
}

export async function seedScenarioPack(
  pack: EvaluationScenarioPack,
): Promise<SeedScenarioPackResult> {
  config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

  const databaseUrl = process.env.DATABASE_URL;
  const highLevelLocationId = process.env.SUB_ACCOUNT_LOCATION_ID;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!highLevelLocationId) throw new Error('SUB_ACCOUNT_LOCATION_ID is required.');

  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);

  try {
    const [tenantLocation] = await database
      .insert(locations)
      .values({ highLevelLocationId })
      .onConflictDoUpdate({
        target: locations.highLevelLocationId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: locations.id, companyId: locations.companyId });
    if (!tenantLocation) throw new Error('Could not resolve the target location.');

    const [agent] = await database
      .insert(voiceAgents)
      .values({
        locationId: tenantLocation.id,
        highLevelAgentId: pack.agent.highLevelAgentId,
        name: pack.agent.name,
      })
      .onConflictDoUpdate({
        target: [voiceAgents.locationId, voiceAgents.highLevelAgentId],
        set: {
          name: pack.agent.name,
          updatedAt: new Date(),
        },
      })
      .returning({ id: voiceAgents.id });
    if (!agent) throw new Error('Could not persist the evaluation Voice Agent.');
    const configuration = {
      agentPrompt: pack.agent.prompt,
      source: 'evaluation_fixture',
      actions: { availability: 'unknown' },
      knowledgeBase: { availability: 'unknown' },
    };
    await database
      .insert(agentConfigSnapshots)
      .values({
        agentId: agent.id,
        sourceHash: createHash('sha256').update(JSON.stringify(configuration)).digest('hex'),
        source: 'fixture',
        configuration,
        evidenceCapabilities: {
          transcript: true,
          timestamps: false,
          audio: false,
          configuredActions: false,
          executedActions: true,
          knowledgeBase: false,
          transcriptionConfiguration: false,
          speechConfiguration: false,
        },
      })
      .onConflictDoUpdate({
        target: [agentConfigSnapshots.agentId, agentConfigSnapshots.sourceHash],
        set: {
          configuration,
          evidenceCapabilities: {
            transcript: true,
            timestamps: false,
            audio: false,
            configuredActions: false,
            executedActions: true,
            knowledgeBase: false,
            transcriptionConfiguration: false,
            speechConfiguration: false,
          },
          capturedAt: new Date(),
        },
      });

    let criteriaActivated = 0;
    for (const definition of pack.agent.userDefinedCriteria ?? []) {
      const compiled = compileUserCriterion(definition.rule);
      const [criterion] = await database
        .insert(successCriteria)
        .values({
          agentId: agent.id,
          stableKey: compiled.stableKey,
          origin: 'user_defined',
          criterionClass: compiled.criterionClass,
          lifecycleState: 'active',
        })
        .onConflictDoUpdate({
          target: [successCriteria.agentId, successCriteria.stableKey],
          set: {
            criterionClass: compiled.criterionClass,
            lifecycleState: 'active',
            updatedAt: new Date(),
          },
        })
        .returning({ id: successCriteria.id });
      if (!criterion) throw new Error(`Could not activate fixture criterion ${definition.id}.`);

      const definitionHash = createHash('sha256')
        .update(JSON.stringify({ rule: definition.rule, compiled }))
        .digest('hex');
      const definitionReference = `evaluation-definition:${definitionHash}`;
      const [latest] = await database
        .select({
          version: successCriterionVersions.version,
          sourceReferences: successCriterionVersions.sourceReferences,
        })
        .from(successCriterionVersions)
        .where(eq(successCriterionVersions.criterionId, criterion.id))
        .orderBy(desc(successCriterionVersions.version))
        .limit(1);
      if (!latest?.sourceReferences.includes(definitionReference)) {
        await database.insert(successCriterionVersions).values({
          criterionId: criterion.id,
          version: (latest?.version ?? 0) + 1,
          title: compiled.title,
          naturalLanguageRule: definition.rule,
          applicabilityDefinition: compiled.applicabilityDefinition,
          evaluationInstructions: compiled.evaluationInstructions,
          requiredEvidence: compiled.requiredEvidence,
          severityPolicy: {
            review: 'A concrete deviation worth inspecting',
            critical: 'A credible risk of serious customer or business harm',
          },
          sourceReferences: [definitionReference],
          allowedRecommendationTargetIds: compiled.allowedRecommendationTargetIds,
          compilerVersion: 'user-criterion-compiler-v1',
        });
      }
      criteriaActivated += 1;
    }

    const baseTime = Date.now() - pack.calls.length * 5 * 60_000;
    let queued = 0;
    let skipped = 0;

    for (const [index, scenario] of pack.calls.entries()) {
      const payload = buildPayload(
        pack,
        scenario,
        highLevelLocationId,
        new Date(baseTime + index * 5 * 60_000),
      );
      const serializedPayload = JSON.stringify(payload);
      const idempotencyHash = createHash('sha256')
        .update(pack.version + ':' + highLevelLocationId + ':' + payload.id)
        .digest('hex');

      const wasQueued = await database.transaction(async (transaction) => {
        const [inbox] = await transaction
          .insert(webhookInbox)
          .values({
            idempotencyKey: 'evaluation-scenario:' + idempotencyHash,
            eventType: 'VoiceAiCallEnd',
            payloadSha256: createHash('sha256').update(serializedPayload).digest('hex'),
            payload,
          })
          .onConflictDoNothing({ target: webhookInbox.idempotencyKey })
          .returning({ id: webhookInbox.id });
        if (!inbox) return false;

        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: 'call.ingestion.requested',
          aggregateType: 'call',
          aggregateId: inbox.id,
          correlationId: inbox.id,
          companyId: tenantLocation.companyId,
          locationId: tenantLocation.id,
          payload: {
            webhookInboxId: inbox.id,
            highLevelCallId: payload.id,
          },
        });
        return true;
      });

      if (wasQueued) queued += 1;
      else skipped += 1;
    }

    return { queued, skipped, criteriaActivated };
  } finally {
    await pool.end();
  }
}

function buildPayload(
  pack: EvaluationScenarioPack,
  scenario: EvaluationScenarioPack['calls'][number],
  locationId: string,
  createdAt: Date,
): VoiceCallEndPayload {
  const source = scenario.payload;
  return {
    type: 'VoiceAiCallEnd',
    id: source.id,
    locationId,
    agentId: pack.agent.highLevelAgentId,
    contactId: 'eval-contact-' + source.id.slice(-32),
    createdAt: createdAt.toISOString(),
    duration: source.duration,
    summary: source.summary ?? '',
    transcript: source.transcript,
    translation: source.translation ?? null,
    trialCall: true,
    extractedData: {
      ...(source.extractedData ?? {}),
      evaluationFixture: {
        packVersion: pack.version,
        scenarioName: scenario.name,
        ...scenario.fixtureMetadata,
      },
    },
    executedCallActions: (source.executedCallActions ?? []).map((action) => {
      if (!action || typeof action !== 'object') return action;
      return {
        ...action,
        executedAt: new Date(createdAt.getTime() + source.duration * 750).toISOString(),
      };
    }),
  };
}
