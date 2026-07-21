import type { RecommendationBatchResponse } from '@copilot/contracts';
import {
  agentRecommendations,
  callAnalysisRuns,
  criterionResults,
  locations,
  messageOutbox,
  recommendationGenerationStates,
  successCriteria,
  voiceAgents,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PipelineService } from '../pipeline/pipeline.service';

@Injectable()
export class RecommendationCommandsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly pipelineService: PipelineService,
  ) {}

  async generateAll(locationId: string, agentId: string): Promise<RecommendationBatchResponse> {
    const context = await this.requireAgentContext(locationId, agentId);
    await this.pipelineService.refreshAgentConfiguration(locationId, agentId);
    const criteria = await this.databaseService.client
      .selectDistinct({ id: successCriteria.id, createdAt: successCriteria.createdAt })
      .from(successCriteria)
      .innerJoin(criterionResults, eq(criterionResults.criterionId, successCriteria.id))
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(
        and(
          eq(successCriteria.agentId, agentId),
          eq(criterionResults.result, 'fail'),
          eq(callAnalysisRuns.isCurrent, true),
          eq(voiceCalls.agentId, agentId),
          eq(voiceCalls.locationId, context.locationId),
        ),
      )
      .orderBy(asc(successCriteria.createdAt));

    const batchId = randomUUID();
    if (!criteria.length) {
      return { batchId, criterionIds: [], queuedCriterionCount: 0, status: 'no_failures' };
    }

    await this.databaseService.client.transaction(async (transaction) => {
      for (const criterion of criteria) {
        const requestId = randomUUID();
        const payload = { requestId, agentId, criterionId: criterion.id };
        const [inbox] = await transaction
          .insert(webhookInbox)
          .values({
            idempotencyKey: `recommendation:${requestId}`,
            eventType: 'InternalRecommendationRequested',
            payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
            payload,
            status: 'processed',
            processedAt: new Date(),
          })
          .returning({ id: webhookInbox.id });
        if (!inbox) throw new Error('Recommendation request inbox creation returned no record.');

        await transaction
          .insert(recommendationGenerationStates)
          .values({
            requestId,
            agentId,
            criterionId: criterion.id,
            status: 'queued',
          })
          .onConflictDoUpdate({
            target: [
              recommendationGenerationStates.agentId,
              recommendationGenerationStates.criterionId,
            ],
            set: {
              requestId,
              status: 'queued',
              lastError: null,
              requestedAt: new Date(),
              completedAt: null,
              updatedAt: new Date(),
            },
          });
        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: 'criterion.recommendation.requested',
          aggregateType: 'criterion',
          aggregateId: criterion.id,
          correlationId: batchId,
          companyId: context.companyId,
          locationId: context.locationId,
          payload,
        });
      }
    });
    return {
      batchId,
      criterionIds: criteria.map(({ id }) => id),
      queuedCriterionCount: criteria.length,
      status: 'queued',
    };
  }

  async remove(locationId: string, agentId: string, criterionId: string): Promise<void> {
    await this.requireCriterionContext(locationId, agentId, criterionId);
    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .delete(agentRecommendations)
        .where(
          and(
            eq(agentRecommendations.agentId, agentId),
            eq(agentRecommendations.criterionId, criterionId),
          ),
        );
      await transaction
        .delete(recommendationGenerationStates)
        .where(
          and(
            eq(recommendationGenerationStates.agentId, agentId),
            eq(recommendationGenerationStates.criterionId, criterionId),
          ),
        );
    });
  }

  private async requireAgentContext(locationId: string, agentId: string) {
    const [context] = await this.databaseService.client
      .select({ locationId: locations.id, companyId: locations.companyId })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!context) throw new NotFoundException('Voice Agent was not found for this location.');
    return context;
  }

  private async requireCriterionContext(locationId: string, agentId: string, criterionId: string) {
    const [context] = await this.databaseService.client
      .select({ locationId: locations.id, companyId: locations.companyId })
      .from(successCriteria)
      .innerJoin(voiceAgents, eq(voiceAgents.id, successCriteria.agentId))
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(
        and(
          eq(successCriteria.id, criterionId),
          eq(successCriteria.agentId, agentId),
          eq(locations.highLevelLocationId, locationId),
        ),
      )
      .limit(1);
    if (!context) throw new NotFoundException('Success Criterion was not found for this agent.');
    return context;
  }
}
