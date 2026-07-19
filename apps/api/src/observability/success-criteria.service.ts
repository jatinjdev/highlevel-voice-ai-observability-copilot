import {
  successCriterionActivationResponseSchema,
  successCriterionDraftResponseSchema,
  type SuccessCriterion,
} from '@copilot/contracts';
import {
  criterionSetMembers,
  criterionSets,
  locations,
  messageOutbox,
  successCriteria,
  successCriterionVersions,
  voiceAgents,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { z } from 'zod';

import { DatabaseService } from '../database/database.service';
import { compileUserCriterion } from './user-criterion-compiler';

const COMPILER_VERSION = 'user-criterion-compiler-v1';

type DraftResponse = z.infer<typeof successCriterionDraftResponseSchema>;
type ActivationResponse = z.infer<typeof successCriterionActivationResponseSchema>;

@Injectable()
export class SuccessCriteriaService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createDraft(
    locationId: string,
    agentId: string,
    naturalLanguageRule: string,
  ): Promise<DraftResponse> {
    await this.requireAgent(locationId, agentId);
    const compiled = compileUserCriterion(naturalLanguageRule);
    const stableKey = compiled.stableKey;

    const criterion = await this.databaseService.client.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: successCriteria.id })
        .from(successCriteria)
        .where(and(eq(successCriteria.agentId, agentId), eq(successCriteria.stableKey, stableKey)))
        .limit(1);
      if (existing) {
        const [version] = await transaction
          .select()
          .from(successCriterionVersions)
          .where(eq(successCriterionVersions.criterionId, existing.id))
          .orderBy(desc(successCriterionVersions.version))
          .limit(1);
        if (!version) throw new Error('Existing Success Criterion has no version.');
        return { id: existing.id, stableKey, version };
      }

      const [created] = await transaction
        .insert(successCriteria)
        .values({
          agentId,
          stableKey,
          origin: 'user_defined',
          criterionClass: compiled.criterionClass,
          lifecycleState: 'draft',
        })
        .returning({ id: successCriteria.id });
      if (!created) throw new Error('Success Criterion creation returned no record.');
      const [version] = await transaction
        .insert(successCriterionVersions)
        .values({
          criterionId: created.id,
          version: 1,
          title: compiled.title,
          naturalLanguageRule,
          applicabilityDefinition: compiled.applicabilityDefinition,
          evaluationInstructions: compiled.evaluationInstructions,
          requiredEvidence: compiled.requiredEvidence,
          severityPolicy: { fail: 'Observable violation of this criterion' },
          sourceReferences: [`user-rule:${hash(naturalLanguageRule)}`],
          allowedRecommendationTargetIds: compiled.allowedRecommendationTargetIds,
          compilerVersion: COMPILER_VERSION,
        })
        .returning();
      if (!version) throw new Error('Success Criterion version creation returned no record.');
      return { id: created.id, stableKey, version };
    });

    return {
      criterion: serializeCriterion(
        criterion.id,
        criterion.stableKey,
        'user_defined',
        compiled.criterionClass,
        'draft',
        criterion.version,
      ),
      warnings: compiled.warnings,
    };
  }

  async updateDraft(
    locationId: string,
    agentId: string,
    criterionId: string,
    naturalLanguageRule: string,
  ): Promise<DraftResponse> {
    const criterion = await this.requireCriterion(locationId, agentId, criterionId);
    if (criterion.origin !== 'user_defined') {
      throw new UnprocessableEntityException('Only user-defined Success Criteria can be edited.');
    }
    const compiled = compileUserCriterion(naturalLanguageRule);
    const [latest] = await this.databaseService.client
      .select({ version: successCriterionVersions.version })
      .from(successCriterionVersions)
      .where(eq(successCriterionVersions.criterionId, criterionId))
      .orderBy(desc(successCriterionVersions.version))
      .limit(1);
    const [version] = await this.databaseService.client
      .insert(successCriterionVersions)
      .values({
        criterionId,
        version: (latest?.version ?? 0) + 1,
        title: compiled.title,
        naturalLanguageRule,
        applicabilityDefinition: compiled.applicabilityDefinition,
        evaluationInstructions: compiled.evaluationInstructions,
        requiredEvidence: compiled.requiredEvidence,
        severityPolicy: { fail: 'Observable violation of this criterion' },
        sourceReferences: [`user-rule:${hash(naturalLanguageRule)}`],
        allowedRecommendationTargetIds: compiled.allowedRecommendationTargetIds,
        compilerVersion: COMPILER_VERSION,
      })
      .returning();
    if (!version) throw new Error('Success Criterion version creation returned no record.');
    await this.databaseService.client
      .update(successCriteria)
      .set({
        criterionClass: compiled.criterionClass,
        lifecycleState: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(successCriteria.id, criterionId));
    return {
      criterion: serializeCriterion(
        criterion.id,
        criterion.stableKey,
        'user_defined',
        compiled.criterionClass,
        'draft',
        version,
      ),
      warnings: compiled.warnings,
    };
  }

  async activate(
    locationId: string,
    agentId: string,
    criterionId: string,
  ): Promise<ActivationResponse> {
    const criterion = await this.requireCriterion(locationId, agentId, criterionId);
    await this.databaseService.client
      .update(successCriteria)
      .set({ lifecycleState: 'active', updatedAt: new Date() })
      .where(eq(successCriteria.id, criterionId));
    const criterionSet = await this.createActiveSet(agentId);
    const reanalysisQueued = await this.queueAgentReanalysis(
      agentId,
      criterionSet.id,
      'criteria_change',
    );
    const [version] = await this.databaseService.client
      .select()
      .from(successCriterionVersions)
      .where(eq(successCriterionVersions.criterionId, criterionId))
      .orderBy(desc(successCriterionVersions.version))
      .limit(1);
    if (!version) throw new Error('Activated Success Criterion has no version.');
    return {
      criterion: serializeCriterion(
        criterion.id,
        criterion.stableKey,
        normalizeOrigin(criterion.origin),
        normalizeClass(criterion.criterionClass),
        'active',
        version,
      ),
      criterionSet,
      reanalysisQueued,
    };
  }

  async retire(
    locationId: string,
    agentId: string,
    criterionId: string,
  ): Promise<ActivationResponse> {
    const criterion = await this.requireCriterion(locationId, agentId, criterionId);
    await this.databaseService.client
      .update(successCriteria)
      .set({ lifecycleState: 'retired', updatedAt: new Date() })
      .where(eq(successCriteria.id, criterionId));
    const criterionSet = await this.createActiveSet(agentId);
    const reanalysisQueued = await this.queueAgentReanalysis(
      agentId,
      criterionSet.id,
      'criteria_change',
    );
    const [version] = await this.databaseService.client
      .select()
      .from(successCriterionVersions)
      .where(eq(successCriterionVersions.criterionId, criterionId))
      .orderBy(desc(successCriterionVersions.version))
      .limit(1);
    if (!version) throw new Error('Retired Success Criterion has no version.');
    return {
      criterion: serializeCriterion(
        criterion.id,
        criterion.stableKey,
        normalizeOrigin(criterion.origin),
        normalizeClass(criterion.criterionClass),
        'retired',
        version,
      ),
      criterionSet,
      reanalysisQueued,
    };
  }

  private async createActiveSet(agentId: string) {
    return this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .select({ id: voiceAgents.id })
        .from(voiceAgents)
        .where(eq(voiceAgents.id, agentId))
        .for('update');
      const rows = await transaction
        .select({
          criterionId: successCriteria.id,
          versionId: successCriterionVersions.id,
          version: successCriterionVersions.version,
        })
        .from(successCriteria)
        .innerJoin(
          successCriterionVersions,
          eq(successCriterionVersions.criterionId, successCriteria.id),
        )
        .where(
          and(eq(successCriteria.agentId, agentId), eq(successCriteria.lifecycleState, 'active')),
        )
        .orderBy(desc(successCriterionVersions.version));
      const latest = new Map<string, string>();
      for (const row of rows)
        if (!latest.has(row.criterionId)) latest.set(row.criterionId, row.versionId);
      const versionIds = [...latest.values()].sort();
      if (versionIds.length === 0) {
        throw new UnprocessableEntityException(
          'An agent must retain at least one active criterion.',
        );
      }
      const fingerprint = hash(versionIds.join(':'));
      const [existing] = await transaction
        .select({ id: criterionSets.id, version: criterionSets.version })
        .from(criterionSets)
        .where(and(eq(criterionSets.agentId, agentId), eq(criterionSets.fingerprint, fingerprint)))
        .limit(1);
      await transaction
        .update(criterionSets)
        .set({ active: false })
        .where(eq(criterionSets.agentId, agentId));
      if (existing) {
        await transaction
          .update(criterionSets)
          .set({ active: true })
          .where(eq(criterionSets.id, existing.id));
        return { ...existing, fingerprint };
      }
      const [latestSet] = await transaction
        .select({ version: criterionSets.version })
        .from(criterionSets)
        .where(eq(criterionSets.agentId, agentId))
        .orderBy(desc(criterionSets.version))
        .limit(1);
      const [created] = await transaction
        .insert(criterionSets)
        .values({
          agentId,
          version: (latestSet?.version ?? 0) + 1,
          fingerprint,
          active: true,
        })
        .returning({ id: criterionSets.id, version: criterionSets.version });
      if (!created) throw new Error('Criterion Set creation returned no record.');
      await transaction.insert(criterionSetMembers).values(
        versionIds.map((criterionVersionId, displayOrder) => ({
          criterionSetId: created.id,
          criterionVersionId,
          displayOrder,
        })),
      );
      return { ...created, fingerprint };
    });
  }

  private async queueAgentReanalysis(
    agentId: string,
    criterionSetId: string,
    runReason: 'criteria_change',
  ): Promise<number> {
    const calls = await this.databaseService.client
      .select({
        id: voiceCalls.id,
        locationId: voiceCalls.locationId,
        companyId: locations.companyId,
      })
      .from(voiceCalls)
      .innerJoin(locations, eq(locations.id, voiceCalls.locationId))
      .where(eq(voiceCalls.agentId, agentId));
    let queued = 0;
    for (const call of calls) {
      const didQueue = await this.databaseService.client.transaction(async (transaction) => {
        const payload = { callId: call.id, agentId, runReason, requestKey: criterionSetId };
        const [inbox] = await transaction
          .insert(webhookInbox)
          .values({
            idempotencyKey: `criteria-reanalysis:${criterionSetId}:${call.id}`,
            eventType: 'InternalAnalysisRequested',
            payloadSha256: hash(JSON.stringify(payload)),
            payload,
            status: 'processed',
            processedAt: new Date(),
          })
          .onConflictDoNothing({ target: webhookInbox.idempotencyKey })
          .returning({ id: webhookInbox.id });
        if (!inbox) return false;
        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: 'call.analysis.requested',
          aggregateType: 'call',
          aggregateId: call.id,
          correlationId: inbox.id,
          companyId: call.companyId,
          locationId: call.locationId,
          payload,
        });
        return true;
      });
      if (didQueue) queued += 1;
    }
    return queued;
  }

  private async requireAgent(locationId: string, agentId: string) {
    const [agent] = await this.databaseService.client
      .select({ id: voiceAgents.id })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');
    return agent;
  }

  private async requireCriterion(locationId: string, agentId: string, criterionId: string) {
    await this.requireAgent(locationId, agentId);
    const [criterion] = await this.databaseService.client
      .select()
      .from(successCriteria)
      .where(and(eq(successCriteria.id, criterionId), eq(successCriteria.agentId, agentId)))
      .limit(1);
    if (!criterion) throw new NotFoundException('Success Criterion was not found for this agent.');
    return criterion;
  }
}

function serializeCriterion(
  id: string,
  stableKey: string,
  origin: SuccessCriterion['origin'],
  criterionClass: SuccessCriterion['criterionClass'],
  lifecycleState: SuccessCriterion['lifecycleState'],
  version: typeof successCriterionVersions.$inferSelect,
): Omit<SuccessCriterion, 'resultDistribution'> {
  return {
    id,
    stableKey,
    origin,
    criterionClass,
    lifecycleState,
    versionId: version.id,
    version: version.version,
    title: version.title,
    naturalLanguageRule: version.naturalLanguageRule,
    applicabilityDefinition: version.applicabilityDefinition,
    requiredEvidence: version.requiredEvidence,
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeOrigin(value: string): SuccessCriterion['origin'] {
  return value === 'prompt_generated' || value === 'configuration' || value === 'user_defined'
    ? value
    : 'universal';
}

function normalizeClass(value: string): SuccessCriterion['criterionClass'] {
  return value === 'safety' || value === 'outcome' || value === 'diagnostic' ? value : 'adherence';
}
