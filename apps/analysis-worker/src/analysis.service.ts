import type { CallAnalysisRequestedEvent } from '@copilot/contracts';
import {
  analysisBatchItems,
  analysisBatches,
  callActionEvents,
  callAnalysisRuns,
  callTurns,
  criterionResultActionEvidence,
  criterionResultEvidence,
  criterionResults,
  processedMessages,
  voiceAgents,
  voiceCalls,
} from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { CallAnalyzer } from './call-analyzer';
import { CriteriaService } from './criteria.service';
import { WorkerDatabaseService } from './database.service';
import type { CallEvaluationInput, CriterionEvaluation } from './evaluation.types';

const CONSUMER_NAME = 'analysis-worker-v5';
const EVALUATOR_VERSION = 'criteria-checklist-v1';
const ANALYSIS_LEASE_MS = 5 * 60_000;

interface AnalysisClaim {
  analysisId: string;
  leaseToken: string;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly databaseService: WorkerDatabaseService,
    private readonly criteriaService: CriteriaService,
    private readonly callAnalyzer: CallAnalyzer,
  ) {}

  async analyze(event: CallAnalysisRequestedEvent): Promise<'processed' | 'duplicate' | 'busy'> {
    const locationId = event.tenant.locationId;
    if (!locationId) throw new Error('Call analysis event has no location tenant.');

    const record = await this.loadCall(event.data.callId, event.data.agentId);
    if (record.locationId !== locationId)
      throw new Error('Call location does not match the queue tenant.');

    const criteria = await this.criteriaService.listForEvaluation(record.agentId);

    const input: CallEvaluationInput = {
      callId: record.callId,
      agentId: record.agentId,
      durationSeconds: record.durationSeconds,
      criteria,
      turns: record.turns,
      actionEvents: record.actionEvents,
    };
    const inputFingerprint = fingerprint({
      transcript: input.turns.map(({ ordinal, speaker, text }) => ({ ordinal, speaker, text })),
      actions: input.actionEvents.map(({ ordinal, actionName, outcome, resultSummary }) => ({
        ordinal,
        actionName,
        outcome,
        resultSummary,
      })),
      criteria,
      evaluatorVersion: EVALUATOR_VERSION,
    });
    const claim = await this.claim({
      callId: record.callId,
      inputFingerprint,
      executionKey: executionKeyFor(event, inputFingerprint),
      runReason: event.data.runReason,
    });
    if (claim === 'completed') return 'duplicate';
    if (claim === 'busy') return 'busy';

    try {
      const evaluation = criteria.length
        ? await this.callAnalyzer.analyze(input)
        : { criterionResults: [] };
      await this.complete(event, claim, input, evaluation);
      return 'processed';
    } catch (error) {
      await this.fail(event, claim.analysisId, claim.leaseToken, error);
      throw error;
    }
  }

  private async loadCall(callId: string, agentId: string) {
    const [record] = await this.databaseService.client
      .select({
        callId: voiceCalls.id,
        agentId: voiceAgents.id,
        locationId: voiceCalls.locationId,
        durationSeconds: voiceCalls.durationSeconds,
      })
      .from(voiceCalls)
      .innerJoin(voiceAgents, eq(voiceCalls.agentId, voiceAgents.id))
      .where(and(eq(voiceCalls.id, callId), eq(voiceAgents.id, agentId)))
      .limit(1);
    if (!record) throw new Error(`Call ${callId} and its agent could not be loaded.`);

    const [turns, actionEvents] = await Promise.all([
      this.databaseService.client
        .select({
          id: callTurns.id,
          ordinal: callTurns.ordinal,
          speaker: callTurns.speaker,
          text: callTurns.text,
        })
        .from(callTurns)
        .where(eq(callTurns.callId, callId))
        .orderBy(callTurns.ordinal),
      this.databaseService.client
        .select({
          id: callActionEvents.id,
          ordinal: callActionEvents.ordinal,
          actionType: callActionEvents.actionType,
          actionName: callActionEvents.actionName,
          outcome: callActionEvents.outcome,
          resultSummary: callActionEvents.resultSummary,
        })
        .from(callActionEvents)
        .where(eq(callActionEvents.callId, callId))
        .orderBy(callActionEvents.ordinal),
    ]);

    return {
      ...record,
      turns: turns.map((turn) => ({
        ...turn,
        speaker: isSpeaker(turn.speaker) ? turn.speaker : ('unknown' as const),
      })),
      actionEvents,
    };
  }

  private claim(input: {
    callId: string;
    inputFingerprint: string;
    executionKey: string;
    runReason: CallAnalysisRequestedEvent['data']['runReason'];
  }): Promise<AnalysisClaim | 'completed' | 'busy'> {
    return this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .select({ id: voiceCalls.id })
        .from(voiceCalls)
        .where(eq(voiceCalls.id, input.callId))
        .for('update');
      const [existing] = await transaction
        .select({
          id: callAnalysisRuns.id,
          status: callAnalysisRuns.status,
          leasedUntil: callAnalysisRuns.leasedUntil,
          attemptCount: callAnalysisRuns.attemptCount,
        })
        .from(callAnalysisRuns)
        .where(
          and(
            eq(callAnalysisRuns.callId, input.callId),
            eq(callAnalysisRuns.executionKey, input.executionKey),
          ),
        )
        .limit(1);
      if (existing?.status === 'completed') return 'completed';
      if (
        existing?.status === 'processing' &&
        existing.leasedUntil &&
        existing.leasedUntil > new Date()
      )
        return 'busy';

      let analysisId = existing?.id;
      if (!analysisId) {
        const [latest] = await transaction
          .select({ runSequence: callAnalysisRuns.runSequence })
          .from(callAnalysisRuns)
          .where(eq(callAnalysisRuns.callId, input.callId))
          .orderBy(desc(callAnalysisRuns.runSequence))
          .limit(1);
        const [created] = await transaction
          .insert(callAnalysisRuns)
          .values({
            callId: input.callId,
            runSequence: (latest?.runSequence ?? 0) + 1,
            runReason: latest ? input.runReason : 'initial',
            inputFingerprint: input.inputFingerprint,
            executionKey: input.executionKey,
            evaluatorVersion: EVALUATOR_VERSION,
          })
          .returning({ id: callAnalysisRuns.id });
        analysisId = created?.id;
      }
      if (!analysisId) throw new Error('Analysis claim could not create a run.');

      const leaseToken = randomUUID();
      await transaction
        .update(callAnalysisRuns)
        .set({
          status: 'processing',
          leaseToken,
          leasedUntil: new Date(Date.now() + ANALYSIS_LEASE_MS),
          attemptCount: (existing?.attemptCount ?? 0) + 1,
          lastError: null,
          startedAt: new Date(),
        })
        .where(eq(callAnalysisRuns.id, analysisId));
      return { analysisId, leaseToken };
    });
  }

  private async complete(
    event: CallAnalysisRequestedEvent,
    claim: AnalysisClaim,
    input: CallEvaluationInput,
    evaluation: CriterionEvaluation,
  ): Promise<void> {
    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .update(callAnalysisRuns)
        .set({ isCurrent: false })
        .where(
          and(eq(callAnalysisRuns.callId, input.callId), ne(callAnalysisRuns.id, claim.analysisId)),
        );
      const [analysis] = await transaction
        .update(callAnalysisRuns)
        .set({
          status: 'completed',
          provider: this.callAnalyzer.runtime.provider,
          model: this.callAnalyzer.runtime.model,
          evaluatorVersion: EVALUATOR_VERSION,
          isCurrent: true,
          leaseToken: null,
          leasedUntil: null,
          lastError: null,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(callAnalysisRuns.id, claim.analysisId),
            eq(callAnalysisRuns.leaseToken, claim.leaseToken),
          ),
        )
        .returning({ id: callAnalysisRuns.id });
      if (!analysis) throw new Error('Analysis lease was lost before completion.');

      const resultRows = await transaction
        .insert(criterionResults)
        .values(
          evaluation.criterionResults.map((result) => ({
            analysisRunId: claim.analysisId,
            criterionId: result.criterionId,
            result: result.result,
            rationale: result.rationale,
          })),
        )
        .returning({ id: criterionResults.id, criterionId: criterionResults.criterionId });
      const evaluated = new Map(
        evaluation.criterionResults.map((result) => [result.criterionId, result]),
      );
      for (const row of resultRows) {
        const result = evaluated.get(row.criterionId);
        if (!result) continue;
        if (result.evidenceTurnIds.length) {
          await transaction
            .insert(criterionResultEvidence)
            .values(
              result.evidenceTurnIds.map((callTurnId) => ({
                criterionResultId: row.id,
                callTurnId,
              })),
            )
            .onConflictDoNothing();
        }
        if (result.evidenceActionIds.length) {
          await transaction
            .insert(criterionResultActionEvidence)
            .values(
              result.evidenceActionIds.map((callActionEventId) => ({
                criterionResultId: row.id,
                callActionEventId,
              })),
            )
            .onConflictDoNothing();
        }
      }

      if (event.data.batchId) {
        await transaction
          .update(analysisBatchItems)
          .set({
            status: 'completed',
            analysisRunId: claim.analysisId,
            lastError: null,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(analysisBatchItems.batchId, event.data.batchId),
              eq(analysisBatchItems.callId, input.callId),
            ),
          );
        await refreshBatch(transaction, event.data.batchId);
      }

      await transaction
        .insert(processedMessages)
        .values({ consumerName: CONSUMER_NAME, messageId: event.messageId })
        .onConflictDoNothing({
          target: [processedMessages.consumerName, processedMessages.messageId],
        });
    });
  }

  private async fail(
    event: CallAnalysisRequestedEvent,
    analysisId: string,
    leaseToken: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown analysis failure.';
    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .update(callAnalysisRuns)
        .set({
          status: 'failed',
          isCurrent: false,
          leaseToken: null,
          leasedUntil: null,
          lastError: message.slice(0, 2_000),
        })
        .where(
          and(eq(callAnalysisRuns.id, analysisId), eq(callAnalysisRuns.leaseToken, leaseToken)),
        );
      if (!event.data.batchId) return;
      await transaction
        .update(analysisBatchItems)
        .set({
          status: 'failed',
          analysisRunId: analysisId,
          lastError: message.slice(0, 2_000),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(analysisBatchItems.batchId, event.data.batchId),
            eq(analysisBatchItems.callId, event.data.callId),
          ),
        );
      await refreshBatch(transaction, event.data.batchId);
    });
  }
}

async function refreshBatch(
  transaction: WorkerDatabaseService['client'],
  batchId: string,
): Promise<void> {
  const items = await transaction
    .select({ status: analysisBatchItems.status })
    .from(analysisBatchItems)
    .where(eq(analysisBatchItems.batchId, batchId));
  const completedCount = items.filter(({ status }) => status === 'completed').length;
  const failedCount = items.filter(({ status }) => status === 'failed').length;
  const isFinished = completedCount + failedCount === items.length;
  await transaction
    .update(analysisBatches)
    .set({
      status: isFinished ? (failedCount ? 'partial_failed' : 'completed') : 'processing',
      completedCount,
      failedCount,
      completedAt: isFinished ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(analysisBatches.id, batchId));
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function executionKeyFor(event: CallAnalysisRequestedEvent, inputFingerprint: string): string {
  if (event.data.runReason !== 'manual' && event.data.runReason !== 'backtest')
    return inputFingerprint;
  return fingerprint({ inputFingerprint, forceRunKey: event.data.requestKey ?? event.messageId });
}

function isSpeaker(value: string): value is 'agent' | 'customer' | 'unknown' {
  return value === 'agent' || value === 'customer' || value === 'unknown';
}
