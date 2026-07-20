import { normalizeCriterionName, type SuccessCriterion } from '@copilot/contracts';
import {
  agentRecommendations,
  criterionResults,
  locations,
  messageOutbox,
  recommendationGenerationStates,
  successCriteria,
  voiceAgents,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

type CriterionWithoutDistribution = Omit<SuccessCriterion, 'resultDistribution'>;

@Injectable()
export class SuccessCriteriaService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(locationId: string, agentId: string, name: string, description: string) {
    await this.requireAgent(locationId, agentId);
    const normalizedName = normalizeCriterionName(name);
    const requestKey = randomUUID();

    const criterion = await this.databaseService.client.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(successCriteria)
        .values({
          agentId,
          name: name.trim(),
          normalizedName,
          description: description.trim(),
          source: 'user',
        })
        .onConflictDoNothing({ target: [successCriteria.agentId, successCriteria.normalizedName] })
        .returning();
      if (!created)
        throw new ConflictException('A Success Criterion with this name already exists.');
      return created;
    });
    const reanalysisQueued = await this.queueAgentReanalysis(agentId, requestKey);
    return { criterion: serializeCriterion(criterion), reanalysisQueued };
  }

  async update(locationId: string, agentId: string, criterionId: string, description: string) {
    const criterion = await this.requireCriterion(locationId, agentId, criterionId);
    const requestKey = randomUUID();
    const [updated] = await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .delete(criterionResults)
        .where(eq(criterionResults.criterionId, criterionId));
      await transaction
        .delete(agentRecommendations)
        .where(eq(agentRecommendations.criterionId, criterionId));
      await transaction
        .delete(recommendationGenerationStates)
        .where(eq(recommendationGenerationStates.criterionId, criterionId));
      return transaction
        .update(successCriteria)
        .set({ description: description.trim(), updatedAt: new Date() })
        .where(eq(successCriteria.id, criterionId))
        .returning();
    });
    if (!updated) throw new Error('Success Criterion update returned no record.');
    const reanalysisQueued = await this.queueAgentReanalysis(agentId, requestKey);
    return { criterion: serializeCriterion({ ...criterion, ...updated }), reanalysisQueued };
  }

  async remove(locationId: string, agentId: string, criterionId: string): Promise<void> {
    await this.requireCriterion(locationId, agentId, criterionId);
    await this.databaseService.client
      .delete(successCriteria)
      .where(eq(successCriteria.id, criterionId));
  }

  private async queueAgentReanalysis(agentId: string, requestKey: string): Promise<number> {
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
        const payload = {
          callId: call.id,
          agentId,
          runReason: 'criteria_change' as const,
          requestKey,
        };
        const [inbox] = await transaction
          .insert(webhookInbox)
          .values({
            idempotencyKey: `criteria-reanalysis:${requestKey}:${call.id}`,
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
  criterion: typeof successCriteria.$inferSelect,
): CriterionWithoutDistribution {
  return {
    id: criterion.id,
    name: criterion.name,
    description: criterion.description,
    source: criterion.source === 'default' ? 'default' : 'user',
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
