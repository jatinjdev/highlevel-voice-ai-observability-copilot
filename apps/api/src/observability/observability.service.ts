import {
  agentAnalysisDetailSchema,
  agentCallPageSchema,
  analysisBatchStatusSchema,
  callAnalysisDetailSchema,
  observabilityDashboardSchema,
  type AgentAnalysisDetail,
  type AgentCallPage,
  type AgentReanalysisResponse,
  type AgentReanalysisWindow,
  type AnalysisBatchStatus,
  type CallAnalysisDetail,
  type ObservabilityDashboard,
} from '@copilot/contracts';
import {
  agentRecommendations,
  analysisBatchItems,
  analysisBatches,
  callActionEvents,
  callAnalysisRuns,
  callTurns,
  criterionResultActionEvidence,
  criterionResultEvidence,
  criterionResults,
  locations,
  messageOutbox,
  recommendationGenerationStates,
  successCriteria,
  voiceAgentConfigurations,
  voiceAgents,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

interface AgentSummary {
  callsAnalyzed: number;
  averageDurationSeconds: number | null;
  flaggedIssueCount: number;
  callsWithFailures: number;
}

const EMPTY_SUMMARY: AgentSummary = {
  callsAnalyzed: 0,
  averageDurationSeconds: null,
  flaggedIssueCount: 0,
  callsWithFailures: 0,
};

@Injectable()
export class ObservabilityService {
  constructor(private readonly databaseService: DatabaseService) {}

  async dashboard(locationId: string): Promise<ObservabilityDashboard> {
    const agents = await this.databaseService.client
      .select({
        id: voiceAgents.id,
        name: voiceAgents.name,
        lifecycleState: voiceAgents.lifecycleState,
      })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(eq(locations.highLevelLocationId, locationId))
      .orderBy(voiceAgents.name);
    const summaries = await this.summarizeAgents(agents.map(({ id }) => id));
    return observabilityDashboardSchema.parse({
      agents: agents.map((agent) => ({
        ...agent,
        analysisStatus: summaries.get(agent.id)?.status ?? 'not_analyzed',
        summary: summaries.get(agent.id)?.summary ?? EMPTY_SUMMARY,
      })),
    });
  }

  async agentDetail(locationId: string, agentId: string): Promise<AgentAnalysisDetail> {
    const agent = await this.loadAgent(locationId, agentId);
    const [configuration] = await this.databaseService.client
      .select()
      .from(voiceAgentConfigurations)
      .where(eq(voiceAgentConfigurations.agentId, agentId))
      .limit(1);
    const [criteria, calls, recommendations, summaries, statuses] = await Promise.all([
      this.loadCriteria(agentId),
      this.loadAgentCalls(agentId, { limit: 50 }),
      this.loadAgentRecommendations(agentId),
      this.summarizeAgents([agentId]),
      this.loadRecommendationStatuses(agentId),
    ]);
    return agentAnalysisDetailSchema.parse({
      agent,
      summary: summaries.get(agentId)?.summary ?? EMPTY_SUMMARY,
      configuration: configuration
        ? {
            currentPrompt: configuration.currentPrompt,
            promptHash: configuration.promptHash,
            syncStatus: configuration.syncStatus,
            syncedAt: configuration.syncedAt?.toISOString() ?? null,
            configuration: configuration.configuration,
          }
        : null,
      successCriteria: criteria,
      recommendations,
      recommendationStatuses: statuses,
      calls: calls.items,
      nextCallCursor: calls.nextCursor,
      totalCallCount: calls.totalCount,
    });
  }

  async agentCalls(
    locationId: string,
    agentId: string,
    page: { cursor?: string; limit: number },
  ): Promise<AgentCallPage> {
    await this.loadAgent(locationId, agentId);
    return this.loadAgentCalls(agentId, page);
  }

  async callDetail(locationId: string, callId: string): Promise<CallAnalysisDetail> {
    const [row] = await this.databaseService.client
      .select({
        id: voiceCalls.id,
        highLevelCallId: voiceCalls.highLevelCallId,
        agentId: voiceAgents.id,
        agentName: voiceAgents.name,
        createdAt: voiceCalls.callCreatedAt,
        durationSeconds: voiceCalls.durationSeconds,
        direction: voiceCalls.direction,
        sourceSummary: voiceCalls.sourceSummary,
        extractedData: voiceCalls.extractedData,
      })
      .from(voiceCalls)
      .innerJoin(voiceAgents, eq(voiceAgents.id, voiceCalls.agentId))
      .innerJoin(locations, eq(locations.id, voiceCalls.locationId))
      .where(and(eq(voiceCalls.id, callId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!row) throw new NotFoundException('Call was not found for this location.');

    const [analysis] = await this.databaseService.client
      .select()
      .from(callAnalysisRuns)
      .where(and(eq(callAnalysisRuns.callId, callId), eq(callAnalysisRuns.isCurrent, true)))
      .limit(1);
    const [turns, actionEvents, results] = await Promise.all([
      this.databaseService.client
        .select()
        .from(callTurns)
        .where(eq(callTurns.callId, callId))
        .orderBy(callTurns.ordinal),
      this.databaseService.client
        .select()
        .from(callActionEvents)
        .where(eq(callActionEvents.callId, callId))
        .orderBy(callActionEvents.ordinal),
      analysis ? this.loadCriterionResults(analysis.id) : Promise.resolve([]),
    ]);

    return callAnalysisDetailSchema.parse({
      call: {
        ...row,
        createdAt: row.createdAt.toISOString(),
        turns: turns.map((turn) => ({
          id: turn.id,
          ordinal: turn.ordinal,
          speaker: normalizeSpeaker(turn.speaker),
          text: turn.text,
          sourceStartMs: turn.sourceStartMs,
          sourceEndMs: turn.sourceEndMs,
        })),
        actionEvents: actionEvents.map((event) => ({
          id: event.id,
          ordinal: event.ordinal,
          actionType: event.actionType,
          actionName: event.actionName,
          outcome: event.outcome,
          resultSummary: event.resultSummary,
        })),
      },
      analysis: analysis
        ? {
            id: analysis.id,
            runSequence: analysis.runSequence,
            runReason: analysis.runReason,
            status: normalizeCallAnalysisStatus(analysis.status),
            model: analysis.model,
            provider: analysis.provider,
            evaluatorVersion: analysis.evaluatorVersion,
            completedAt: analysis.completedAt?.toISOString() ?? null,
          }
        : null,
      criterionResults: results,
    });
  }

  async reanalyze(
    locationId: string,
    callId: string,
  ): Promise<{ requestId: string; status: 'queued' }> {
    return this.databaseService.client.transaction(async (transaction) => {
      const [call] = await transaction
        .select({
          id: voiceCalls.id,
          agentId: voiceCalls.agentId,
          locationId: voiceCalls.locationId,
          companyId: locations.companyId,
        })
        .from(voiceCalls)
        .innerJoin(locations, eq(locations.id, voiceCalls.locationId))
        .where(and(eq(voiceCalls.id, callId), eq(locations.highLevelLocationId, locationId)))
        .limit(1);
      if (!call) throw new NotFoundException('Call was not found for this location.');
      const requestId = randomUUID();
      const payload = { callId, requestId, requestedBy: 'observability-dashboard' };
      const [inbox] = await transaction
        .insert(webhookInbox)
        .values({
          idempotencyKey: `analysis-request:${requestId}`,
          eventType: 'InternalAnalysisRequested',
          payloadSha256: hash(JSON.stringify(payload)),
          payload,
          status: 'processed',
          processedAt: new Date(),
        })
        .returning({ id: webhookInbox.id });
      if (!inbox) throw new Error('Analysis request could not be persisted.');
      await transaction.insert(messageOutbox).values({
        sourceInboxId: inbox.id,
        eventType: 'call.analysis.requested',
        aggregateType: 'call',
        aggregateId: callId,
        correlationId: requestId,
        companyId: call.companyId,
        locationId: call.locationId,
        payload: { callId, agentId: call.agentId, runReason: 'manual', requestKey: requestId },
      });
      return { requestId, status: 'queued' as const };
    });
  }

  async reanalyzeAgent(
    locationId: string,
    agentId: string,
    window: AgentReanalysisWindow,
  ): Promise<AgentReanalysisResponse> {
    const cutoff = new Date(Date.now() - (window === '24h' ? 86_400_000 : 604_800_000));
    const batchRequestId = randomUUID();
    return this.databaseService.client.transaction(async (transaction) => {
      const [agent] = await transaction
        .select({
          id: voiceAgents.id,
          locationId: voiceAgents.locationId,
          companyId: locations.companyId,
        })
        .from(voiceAgents)
        .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
        .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
        .limit(1);
      if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');
      const calls = await transaction
        .select({ id: voiceCalls.id })
        .from(voiceCalls)
        .where(and(eq(voiceCalls.agentId, agent.id), gte(voiceCalls.callCreatedAt, cutoff)))
        .orderBy(desc(voiceCalls.callCreatedAt));
      await transaction.insert(analysisBatches).values({
        id: batchRequestId,
        agentId: agent.id,
        locationId: agent.locationId,
        window,
        status: calls.length ? 'queued' : 'completed',
        totalCount: calls.length,
        completedAt: calls.length ? null : new Date(),
      });
      const requests = calls.map((call) => ({
        callId: call.id,
        inboxId: randomUUID(),
        requestKey: `${batchRequestId}:${call.id}`,
      }));
      for (let offset = 0; offset < requests.length; offset += 250) {
        const batch = requests.slice(offset, offset + 250);
        await transaction.insert(analysisBatchItems).values(
          batch.map((request) => ({
            batchId: batchRequestId,
            callId: request.callId,
            requestKey: request.requestKey,
          })),
        );
        await transaction.insert(webhookInbox).values(
          batch.map((request) => {
            const payload = {
              callId: request.callId,
              agentId: agent.id,
              runReason: 'manual',
              requestKey: request.requestKey,
              batchId: batchRequestId,
            };
            return {
              id: request.inboxId,
              idempotencyKey: `analysis-batch:${request.requestKey}`,
              eventType: 'InternalAnalysisRequested',
              payloadSha256: hash(JSON.stringify(payload)),
              payload,
              status: 'processed',
              processedAt: new Date(),
            };
          }),
        );
        await transaction.insert(messageOutbox).values(
          batch.map((request) => ({
            sourceInboxId: request.inboxId,
            eventType: 'call.analysis.requested',
            aggregateType: 'call',
            aggregateId: request.callId,
            correlationId: batchRequestId,
            companyId: agent.companyId,
            locationId: agent.locationId,
            payload: {
              callId: request.callId,
              agentId: agent.id,
              runReason: 'manual',
              requestKey: request.requestKey,
              batchId: batchRequestId,
            },
          })),
        );
      }
      return {
        batchRequestId,
        window,
        matchedCallCount: calls.length,
        queuedCallCount: calls.length,
        status: calls.length ? ('queued' as const) : ('no_calls' as const),
      };
    });
  }

  async reanalysisStatus(
    locationId: string,
    agentId: string,
    batchId: string,
  ): Promise<AnalysisBatchStatus> {
    const [batch] = await this.databaseService.client
      .select({
        id: analysisBatches.id,
        agentId: analysisBatches.agentId,
        window: analysisBatches.window,
        status: analysisBatches.status,
        totalCount: analysisBatches.totalCount,
        completedCount: analysisBatches.completedCount,
        failedCount: analysisBatches.failedCount,
        requestedAt: analysisBatches.requestedAt,
        completedAt: analysisBatches.completedAt,
      })
      .from(analysisBatches)
      .innerJoin(locations, eq(locations.id, analysisBatches.locationId))
      .where(
        and(
          eq(analysisBatches.id, batchId),
          eq(analysisBatches.agentId, agentId),
          eq(locations.highLevelLocationId, locationId),
        ),
      )
      .limit(1);
    if (!batch) throw new NotFoundException('Analysis batch was not found for this agent.');
    return analysisBatchStatusSchema.parse({
      ...batch,
      requestedAt: batch.requestedAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
    });
  }

  private async loadAgent(locationId: string, agentId: string) {
    const [agent] = await this.databaseService.client
      .select({
        id: voiceAgents.id,
        name: voiceAgents.name,
        lifecycleState: voiceAgents.lifecycleState,
      })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');
    return agent;
  }

  private async summarizeAgents(agentIds: string[]) {
    const summaries = new Map<
      string,
      { status: 'not_analyzed' | 'processing' | 'completed' | 'failed'; summary: AgentSummary }
    >();
    if (!agentIds.length) return summaries;
    const analyses = await this.databaseService.client
      .select({
        id: callAnalysisRuns.id,
        agentId: voiceCalls.agentId,
        status: callAnalysisRuns.status,
        durationSeconds: voiceCalls.durationSeconds,
      })
      .from(callAnalysisRuns)
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(and(eq(callAnalysisRuns.isCurrent, true), inArray(voiceCalls.agentId, agentIds)));
    const analysisIds = analyses.map(({ id }) => id);
    const failures = analysisIds.length
      ? await this.databaseService.client
          .select({ analysisId: criterionResults.analysisRunId })
          .from(criterionResults)
          .where(
            and(
              inArray(criterionResults.analysisRunId, analysisIds),
              eq(criterionResults.result, 'fail'),
            ),
          )
      : [];
    const failuresByAnalysis = countBy(failures, ({ analysisId }) => analysisId);
    for (const agentId of agentIds) {
      const rows = analyses.filter((analysis) => analysis.agentId === agentId);
      if (!rows.length) continue;
      const completed = rows.filter(({ status }) => status === 'completed');
      summaries.set(agentId, {
        status: rows.some(({ status }) => status === 'processing')
          ? 'processing'
          : completed.length
            ? 'completed'
            : 'failed',
        summary: {
          callsAnalyzed: completed.length,
          averageDurationSeconds: completed.length
            ? completed.reduce((total, row) => total + row.durationSeconds, 0) / completed.length
            : null,
          flaggedIssueCount: rows.reduce(
            (total, row) => total + (failuresByAnalysis.get(row.id) ?? 0),
            0,
          ),
          callsWithFailures: rows.filter((row) => (failuresByAnalysis.get(row.id) ?? 0) > 0).length,
        },
      });
    }
    return summaries;
  }

  private async loadCriteria(agentId: string): Promise<AgentAnalysisDetail['successCriteria']> {
    const criteria = await this.databaseService.client
      .select()
      .from(successCriteria)
      .where(eq(successCriteria.agentId, agentId))
      .orderBy(successCriteria.createdAt);
    if (!criteria.length) return [];
    const results = await this.databaseService.client
      .select({ criterionId: criterionResults.criterionId, result: criterionResults.result })
      .from(criterionResults)
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(
        and(
          eq(callAnalysisRuns.isCurrent, true),
          eq(voiceCalls.agentId, agentId),
          inArray(
            criterionResults.criterionId,
            criteria.map(({ id }) => id),
          ),
        ),
      );
    const distributions = new Map<string, ReturnType<typeof emptyDistribution>>();
    for (const result of results) {
      const distribution = distributions.get(result.criterionId) ?? emptyDistribution();
      if (result.result === 'pass') distribution.pass += 1;
      else if (result.result === 'fail') distribution.fail += 1;
      else if (result.result === 'not_applicable') distribution.notApplicable += 1;
      else distribution.unknown += 1;
      distributions.set(result.criterionId, distribution);
    }
    return criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      source: criterion.source === 'default' ? ('default' as const) : ('user' as const),
      resultDistribution: distributions.get(criterion.id) ?? emptyDistribution(),
    }));
  }

  private async loadAgentCalls(
    agentId: string,
    page: { cursor?: string; limit: number },
  ): Promise<AgentCallPage> {
    const cursor = page.cursor ? decodeCallCursor(page.cursor) : null;
    const pageCondition = cursor
      ? or(
          lt(voiceCalls.callCreatedAt, cursor.createdAt),
          and(eq(voiceCalls.callCreatedAt, cursor.createdAt), lt(voiceCalls.id, cursor.id)),
        )
      : undefined;
    const rows = await this.databaseService.client
      .select({
        id: voiceCalls.id,
        highLevelCallId: voiceCalls.highLevelCallId,
        createdAt: voiceCalls.callCreatedAt,
        durationSeconds: voiceCalls.durationSeconds,
        analysisId: callAnalysisRuns.id,
        status: callAnalysisRuns.status,
      })
      .from(voiceCalls)
      .leftJoin(
        callAnalysisRuns,
        and(eq(callAnalysisRuns.callId, voiceCalls.id), eq(callAnalysisRuns.isCurrent, true)),
      )
      .where(and(eq(voiceCalls.agentId, agentId), pageCondition))
      .orderBy(desc(voiceCalls.callCreatedAt), desc(voiceCalls.id))
      .limit(page.limit + 1);
    const pageRows = rows.slice(0, page.limit);
    const analysisIds = pageRows.flatMap(({ analysisId }) => (analysisId ? [analysisId] : []));
    const failures = analysisIds.length
      ? await this.databaseService.client
          .select({
            analysisId: criterionResults.analysisRunId,
            criterionId: criterionResults.criterionId,
          })
          .from(criterionResults)
          .where(
            and(
              inArray(criterionResults.analysisRunId, analysisIds),
              eq(criterionResults.result, 'fail'),
            ),
          )
      : [];
    const counts = countBy(failures, ({ analysisId }) => analysisId);
    const criteriaByAnalysis = groupValues(
      failures,
      ({ analysisId }) => analysisId,
      ({ criterionId }) => criterionId,
    );
    const [total] = await this.databaseService.client
      .select({ value: count() })
      .from(voiceCalls)
      .where(eq(voiceCalls.agentId, agentId));
    const last = pageRows.at(-1);
    return agentCallPageSchema.parse({
      items: pageRows.map((row) => ({
        id: row.id,
        highLevelCallId: row.highLevelCallId,
        createdAt: row.createdAt.toISOString(),
        durationSeconds: row.durationSeconds,
        analysisStatus: normalizeCallAnalysisStatus(row.status),
        flaggedIssueCount: row.analysisId ? (counts.get(row.analysisId) ?? 0) : 0,
        failedCriterionIds: row.analysisId
          ? [...new Set(criteriaByAnalysis.get(row.analysisId) ?? [])]
          : [],
      })),
      nextCursor:
        rows.length > page.limit && last ? encodeCallCursor(last.createdAt, last.id) : null,
      totalCount: total?.value ?? 0,
    });
  }

  private async loadCriterionResults(
    analysisRunId: string,
  ): Promise<CallAnalysisDetail['criterionResults']> {
    const rows = await this.databaseService.client
      .select({
        id: criterionResults.id,
        criterionId: successCriteria.id,
        criterionName: successCriteria.name,
        criterionDescription: successCriteria.description,
        result: criterionResults.result,
        rationale: criterionResults.rationale,
      })
      .from(criterionResults)
      .innerJoin(successCriteria, eq(successCriteria.id, criterionResults.criterionId))
      .where(eq(criterionResults.analysisRunId, analysisRunId));
    const resultIds = rows.map(({ id }) => id);
    const [turnEvidence, actionEvidence] = resultIds.length
      ? await Promise.all([
          this.databaseService.client
            .select({
              resultId: criterionResultEvidence.criterionResultId,
              turnId: callTurns.id,
              turnOrdinal: callTurns.ordinal,
              speaker: callTurns.speaker,
              text: callTurns.text,
            })
            .from(criterionResultEvidence)
            .innerJoin(callTurns, eq(callTurns.id, criterionResultEvidence.callTurnId))
            .where(inArray(criterionResultEvidence.criterionResultId, resultIds)),
          this.databaseService.client
            .select({
              resultId: criterionResultActionEvidence.criterionResultId,
              id: callActionEvents.id,
              ordinal: callActionEvents.ordinal,
              actionName: callActionEvents.actionName,
              outcome: callActionEvents.outcome,
            })
            .from(criterionResultActionEvidence)
            .innerJoin(
              callActionEvents,
              eq(callActionEvents.id, criterionResultActionEvidence.callActionEventId),
            )
            .where(inArray(criterionResultActionEvidence.criterionResultId, resultIds)),
        ])
      : [[], []];
    const turnsByResult = groupValues(
      turnEvidence,
      ({ resultId }) => resultId,
      (item) => ({
        turnId: item.turnId,
        turnOrdinal: item.turnOrdinal,
        speaker: normalizeSpeaker(item.speaker),
        text: item.text,
      }),
    );
    const actionsByResult = groupValues(
      actionEvidence,
      ({ resultId }) => resultId,
      (item) => ({
        id: item.id,
        ordinal: item.ordinal,
        actionName: item.actionName,
        outcome: item.outcome,
      }),
    );
    return rows.map((row) => ({
      ...row,
      result: normalizeCriterionResult(row.result),
      evidence: turnsByResult.get(row.id) ?? [],
      actionEvidence: actionsByResult.get(row.id) ?? [],
    }));
  }

  private async loadAgentRecommendations(
    agentId: string,
  ): Promise<AgentAnalysisDetail['recommendations']> {
    const recommendations = await this.databaseService.client
      .select({
        id: agentRecommendations.id,
        criterionId: agentRecommendations.criterionId,
        criterionName: successCriteria.name,
        headline: agentRecommendations.headline,
        explanation: agentRecommendations.explanation,
        promptAddition: agentRecommendations.promptAddition,
        sampledFailureCount: agentRecommendations.sampledFailureCount,
        generatedAt: agentRecommendations.generatedAt,
      })
      .from(agentRecommendations)
      .innerJoin(successCriteria, eq(successCriteria.id, agentRecommendations.criterionId))
      .innerJoin(
        voiceAgentConfigurations,
        eq(voiceAgentConfigurations.agentId, agentRecommendations.agentId),
      )
      .where(
        and(
          eq(agentRecommendations.agentId, agentId),
          eq(agentRecommendations.promptHash, voiceAgentConfigurations.promptHash),
        ),
      )
      .orderBy(desc(agentRecommendations.generatedAt));
    const failures = await this.databaseService.client
      .select({ criterionId: criterionResults.criterionId })
      .from(criterionResults)
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(
        and(
          eq(voiceCalls.agentId, agentId),
          eq(callAnalysisRuns.isCurrent, true),
          eq(criterionResults.result, 'fail'),
        ),
      );
    const failureCounts = countBy(failures, ({ criterionId }) => criterionId);
    return recommendations.map((item) => ({
      ...item,
      affectedCallCount: failureCounts.get(item.criterionId) ?? 0,
      generatedAt: item.generatedAt.toISOString(),
    }));
  }

  private async loadRecommendationStatuses(
    agentId: string,
  ): Promise<AgentAnalysisDetail['recommendationStatuses']> {
    const rows = await this.databaseService.client
      .select({
        criterionId: recommendationGenerationStates.criterionId,
        status: recommendationGenerationStates.status,
        lastError: recommendationGenerationStates.lastError,
        requestedAt: recommendationGenerationStates.requestedAt,
      })
      .from(recommendationGenerationStates)
      .where(eq(recommendationGenerationStates.agentId, agentId));
    return rows.map((row) => ({
      criterionId: row.criterionId,
      status: normalizeRecommendationStatus(row.status),
      lastError: row.lastError,
      requestedAt: row.requestedAt.toISOString(),
    }));
  }
}

function emptyDistribution() {
  return { pass: 0, fail: 0, notApplicable: 0, unknown: 0 };
}
function countBy<T>(values: T[], key: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return counts;
}
function groupValues<T, K, V>(values: T[], key: (value: T) => K, project: (value: T) => V) {
  const groups = new Map<K, V[]>();
  for (const value of values) {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), project(value)]);
  }
  return groups;
}
function encodeCallCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );
}
function decodeCallCursor(value: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') throw new Error();
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(decoded.id))
      throw new Error();
    return { createdAt, id: decoded.id };
  } catch {
    throw new BadRequestException('Invalid call-page cursor.');
  }
}
function normalizeCallAnalysisStatus(status: string | null) {
  return status === 'processing' || status === 'completed' || status === 'failed'
    ? status
    : ('queued' as const);
}
function normalizeSpeaker(value: string): 'agent' | 'customer' | 'unknown' {
  return value === 'agent' || value === 'customer' ? value : 'unknown';
}
function normalizeCriterionResult(value: string) {
  return value === 'pass' || value === 'fail' || value === 'not_applicable'
    ? value
    : ('unknown' as const);
}
function normalizeRecommendationStatus(value: string) {
  return value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'not_needed' ||
    value === 'failed'
    ? value
    : ('idle' as const);
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
