import type { CriterionRecommendationRequestedEvent } from '@copilot/contracts';
import {
  agentRecommendations,
  callAnalysisRuns,
  callTurns,
  criterionResultEvidence,
  criterionResults,
  processedMessages,
  recommendationGenerationStates,
  successCriteria,
  voiceAgentConfigurations,
  voiceAgents,
  voiceCalls,
} from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { WorkerDatabaseService } from './database.service';
import { redactSensitiveText } from './prompt-safety';
import { RecommendationGenerator, type RecommendationFailure } from './recommendation-generator';

const MAX_RECENT_FAILED_CALLS = 20;
const MAX_QUOTES_PER_FAILURE = 2;
const MAX_QUOTE_LENGTH = 400;
const MAX_CONTEXT_CHARACTERS = 24_000;
const CONSUMER_NAME = 'recommendation-worker-v1';
const RECOMMENDATION_LEASE_MS = 5 * 60_000;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly databaseService: WorkerDatabaseService,
    private readonly generator: RecommendationGenerator,
  ) {}

  async generate(event: CriterionRecommendationRequestedEvent): Promise<'processed' | 'duplicate'> {
    const locationId = event.tenant.locationId;
    if (!locationId) throw new Error('Recommendation event has no location tenant.');
    await this.requireTenantContext(event.data.agentId, event.data.criterionId, locationId);
    const state = await this.claim(event);
    if (!state) return 'duplicate';

    try {
      const input = await this.loadInput(event.data.agentId, event.data.criterionId, locationId);
      const output = await this.generator.generate({
        criterionDescription: input.criterionDescription,
        currentPrompt: input.currentPrompt,
        failures: input.failures,
      });

      await this.databaseService.client.transaction(async (transaction) => {
        const [currentState] = await transaction
          .select({
            requestId: recommendationGenerationStates.requestId,
          })
          .from(recommendationGenerationStates)
          .where(eq(recommendationGenerationStates.id, state.id))
          .for('update');
        const [currentConfiguration] = await transaction
          .select({ promptHash: voiceAgentConfigurations.promptHash })
          .from(voiceAgentConfigurations)
          .where(eq(voiceAgentConfigurations.agentId, event.data.agentId))
          .for('update');

        // A newer request or prompt sync supersedes this model response. Leaving the
        // existing recommendation untouched avoids publishing stale guidance.
        if (
          currentState?.requestId !== event.data.requestId ||
          currentConfiguration?.promptHash !== input.promptHash
        ) {
          return;
        }
        await transaction
          .delete(agentRecommendations)
          .where(
            and(
              eq(agentRecommendations.agentId, event.data.agentId),
              eq(agentRecommendations.criterionId, event.data.criterionId),
            ),
          );
        if (output.promptCoverage === 'missing' && output.recommendation) {
          await transaction.insert(agentRecommendations).values({
            agentId: event.data.agentId,
            criterionId: event.data.criterionId,
            headline: output.recommendation.headline,
            explanation: output.explanation,
            promptAddition: output.recommendation.promptAddition,
            promptHash: input.promptHash,
            sampledFailureCount: input.failures.length,
          });
        }
        await transaction
          .update(recommendationGenerationStates)
          .set({
            status: output.promptCoverage === 'missing' ? 'completed' : 'not_needed',
            lastError: null,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(recommendationGenerationStates.id, state.id));
      });
      return 'processed';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown recommendation failure.';
      await this.databaseService.client.transaction(async (transaction) => {
        await transaction
          .update(recommendationGenerationStates)
          .set({
            status: 'failed',
            lastError: message.slice(0, 2_000),
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(recommendationGenerationStates.id, state.id),
              eq(recommendationGenerationStates.requestId, event.data.requestId),
            ),
          );
        // A failed attempt may be retried by SQS. Releasing only this message's
        // claim preserves at-least-once delivery without allowing concurrent runs.
        await transaction
          .delete(processedMessages)
          .where(
            and(
              eq(processedMessages.consumerName, CONSUMER_NAME),
              eq(processedMessages.messageId, event.messageId),
            ),
          );
      });
      throw error;
    }
  }

  private async claim(
    event: CriterionRecommendationRequestedEvent,
  ): Promise<{ id: string } | null> {
    return this.databaseService.client.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          id: recommendationGenerationStates.id,
          requestId: recommendationGenerationStates.requestId,
          status: recommendationGenerationStates.status,
          updatedAt: recommendationGenerationStates.updatedAt,
        })
        .from(recommendationGenerationStates)
        .where(
          and(
            eq(recommendationGenerationStates.agentId, event.data.agentId),
            eq(recommendationGenerationStates.criterionId, event.data.criterionId),
          ),
        )
        .for('update');
      if (!state || state.requestId !== event.data.requestId) return null;
      if (state.status === 'completed' || state.status === 'not_needed') return null;
      if (
        state.status === 'processing' &&
        state.updatedAt > new Date(Date.now() - RECOMMENDATION_LEASE_MS)
      )
        return null;
      if (state.status === 'processing') {
        // A worker may have crashed after claiming the message. Once its lease has
        // expired, release the durable message claim so the SQS redelivery can recover.
        await transaction
          .delete(processedMessages)
          .where(
            and(
              eq(processedMessages.consumerName, CONSUMER_NAME),
              eq(processedMessages.messageId, event.messageId),
            ),
          );
      }
      const [messageClaim] = await transaction
        .insert(processedMessages)
        .values({ consumerName: CONSUMER_NAME, messageId: event.messageId })
        .onConflictDoNothing({
          target: [processedMessages.consumerName, processedMessages.messageId],
        })
        .returning({ id: processedMessages.id });
      if (!messageClaim) return null;
      await transaction
        .update(recommendationGenerationStates)
        .set({ status: 'processing', lastError: null, updatedAt: new Date() })
        .where(eq(recommendationGenerationStates.id, state.id));
      return { id: state.id };
    });
  }

  private async loadInput(
    agentId: string,
    criterionId: string,
    locationId: string,
  ): Promise<{
    criterionDescription: string;
    currentPrompt: string;
    promptHash: string;
    failures: RecommendationFailure[];
  }> {
    const [context] = await this.databaseService.client
      .select({
        criterionDescription: successCriteria.description,
        currentPrompt: voiceAgentConfigurations.currentPrompt,
        promptHash: voiceAgentConfigurations.promptHash,
      })
      .from(successCriteria)
      .innerJoin(voiceAgents, eq(voiceAgents.id, successCriteria.agentId))
      .innerJoin(
        voiceAgentConfigurations,
        eq(voiceAgentConfigurations.agentId, successCriteria.agentId),
      )
      .where(
        and(
          eq(successCriteria.id, criterionId),
          eq(successCriteria.agentId, agentId),
          eq(voiceAgents.locationId, locationId),
        ),
      )
      .limit(1);
    if (!context)
      throw new Error('The criterion or current agent configuration could not be loaded.');
    if (!context.currentPrompt || !context.promptHash)
      throw new Error(
        'The current agent prompt is unavailable. Sync the agent before generating recommendations.',
      );

    const failures = await this.databaseService.client
      .select({ id: criterionResults.id, rationale: criterionResults.rationale })
      .from(criterionResults)
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(
        and(
          eq(criterionResults.criterionId, criterionId),
          eq(criterionResults.result, 'fail'),
          eq(callAnalysisRuns.isCurrent, true),
          eq(voiceCalls.agentId, agentId),
          eq(voiceCalls.locationId, locationId),
        ),
      )
      .orderBy(desc(voiceCalls.callCreatedAt))
      .limit(MAX_RECENT_FAILED_CALLS);
    if (!failures.length)
      throw new Error('This criterion has no current failed calls to learn from.');

    const evidence = await this.databaseService.client
      .select({
        resultId: criterionResultEvidence.criterionResultId,
        text: callTurns.text,
        ordinal: callTurns.ordinal,
      })
      .from(criterionResultEvidence)
      .innerJoin(callTurns, eq(callTurns.id, criterionResultEvidence.callTurnId))
      .where(
        inArray(
          criterionResultEvidence.criterionResultId,
          failures.map(({ id }) => id),
        ),
      )
      .orderBy(callTurns.ordinal);
    const quotesByResult = new Map<string, string[]>();
    for (const row of evidence) {
      const quotes = quotesByResult.get(row.resultId) ?? [];
      if (quotes.length < MAX_QUOTES_PER_FAILURE)
        quotes.push(redactSensitiveText(row.text).slice(0, MAX_QUOTE_LENGTH));
      quotesByResult.set(row.resultId, quotes);
    }

    const boundedFailures: RecommendationFailure[] = [];
    let characters = context.criterionDescription.length + context.currentPrompt.length;
    for (const failure of failures) {
      const item = { rationale: failure.rationale, quotes: quotesByResult.get(failure.id) ?? [] };
      const size =
        item.rationale.length + item.quotes.reduce((sum, quote) => sum + quote.length, 0);
      if (boundedFailures.length && characters + size > MAX_CONTEXT_CHARACTERS) break;
      boundedFailures.push(item);
      characters += size;
    }

    return {
      criterionDescription: context.criterionDescription,
      currentPrompt: context.currentPrompt,
      promptHash: context.promptHash,
      failures: boundedFailures,
    };
  }

  private async requireTenantContext(
    agentId: string,
    criterionId: string,
    locationId: string,
  ): Promise<void> {
    const [context] = await this.databaseService.client
      .select({ id: successCriteria.id })
      .from(successCriteria)
      .innerJoin(voiceAgents, eq(voiceAgents.id, successCriteria.agentId))
      .where(
        and(
          eq(successCriteria.id, criterionId),
          eq(successCriteria.agentId, agentId),
          eq(voiceAgents.locationId, locationId),
        ),
      )
      .limit(1);
    if (!context) throw new Error('Recommendation context does not match the queue tenant.');
  }
}
