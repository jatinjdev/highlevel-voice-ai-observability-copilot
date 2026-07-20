import type { RecommendationGenerationResponse } from '@copilot/contracts';
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
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class RecommendationCommandsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async generate(
    locationId: string,
    agentId: string,
    criterionId: string,
  ): Promise<RecommendationGenerationResponse> {
    const context = await this.requireContext(locationId, agentId, criterionId);
    const [failureCount] = await this.databaseService.client
      .select({ value: count() })
      .from(criterionResults)
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(
        and(
          eq(criterionResults.criterionId, criterionId),
          eq(criterionResults.result, 'fail'),
          eq(callAnalysisRuns.isCurrent, true),
          eq(voiceCalls.agentId, agentId),
        ),
      );
    if (!failureCount?.value)
      throw new UnprocessableEntityException(
        'This criterion has no failed calls to generate guidance from.',
      );

    const requestId = randomUUID();
    await this.databaseService.client.transaction(async (transaction) => {
      const payload = { requestId, agentId, criterionId };
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
          criterionId,
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
        aggregateId: criterionId,
        correlationId: inbox.id,
        companyId: context.companyId,
        locationId: context.locationId,
        payload,
      });
    });
    return { requestId, criterionId, status: 'queued' };
  }

  async remove(locationId: string, agentId: string, criterionId: string): Promise<void> {
    await this.requireContext(locationId, agentId, criterionId);
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

  private async requireContext(locationId: string, agentId: string, criterionId: string) {
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
