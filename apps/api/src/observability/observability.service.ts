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
  type Recommendation,
} from '@copilot/contracts';
import {
  agentConfigSnapshots,
  analysisBatchItems,
  analysisBatches,
  callActionEvents,
  callAnalysisRuns,
  callTurns,
  criterionResultEvidence,
  criterionResults,
  locations,
  messageOutbox,
  recommendations,
  successCriteria,
  successCriterionVersions,
  voiceAgents,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
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
      agents: agents.map((agent) => {
        const aggregate = summaries.get(agent.id);
        return {
          ...agent,
          analysisStatus: aggregate?.status ?? 'not_analyzed',
          summary: aggregate?.summary ?? EMPTY_SUMMARY,
        };
      }),
    });
  }

  async agentDetail(locationId: string, agentId: string): Promise<AgentAnalysisDetail> {
    const agent = await this.loadAgent(locationId, agentId);
    const [configuration] = await this.databaseService.client
      .select()
      .from(agentConfigSnapshots)
      .where(and(eq(agentConfigSnapshots.agentId, agentId), isNull(agentConfigSnapshots.validTo)))
      .orderBy(desc(agentConfigSnapshots.capturedAt))
      .limit(1);
    const [criteria, calls, recommendations, summaries] = await Promise.all([
      this.loadCriteria(agentId),
      this.loadAgentCalls(agentId, { limit: 50 }),
      this.loadAgentRecommendations(agentId),
      this.summarizeAgents([agentId]),
    ]);

    return agentAnalysisDetailSchema.parse({
      agent,
      summary: summaries.get(agentId)?.summary ?? EMPTY_SUMMARY,
      activeConfiguration: configuration ? serializeConfiguration(configuration) : null,
      successCriteria: criteria,
      recommendations,
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
        configId: agentConfigSnapshots.id,
        configSource: agentConfigSnapshots.source,
        configSourceHash: agentConfigSnapshots.sourceHash,
        configCapturedAt: agentConfigSnapshots.capturedAt,
        configuration: agentConfigSnapshots.configuration,
        evidenceCapabilities: agentConfigSnapshots.evidenceCapabilities,
      })
      .from(voiceCalls)
      .innerJoin(voiceAgents, eq(voiceAgents.id, voiceCalls.agentId))
      .innerJoin(locations, eq(locations.id, voiceCalls.locationId))
      .innerJoin(
        agentConfigSnapshots,
        eq(agentConfigSnapshots.id, voiceCalls.agentConfigSnapshotId),
      )
      .where(and(eq(voiceCalls.id, callId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!row) throw new NotFoundException('Call was not found for this location.');

    const [analysis] = await this.databaseService.client
      .select()
      .from(callAnalysisRuns)
      .where(and(eq(callAnalysisRuns.callId, callId), eq(callAnalysisRuns.isCurrent, true)))
      .limit(1);
    const [turns, actionEvents, results, recommendationRows] = await Promise.all([
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
      analysis ? this.loadCallRecommendations(analysis.id) : Promise.resolve([]),
    ]);

    return callAnalysisDetailSchema.parse({
      call: {
        id: row.id,
        highLevelCallId: row.highLevelCallId,
        agentId: row.agentId,
        agentName: row.agentName,
        createdAt: row.createdAt.toISOString(),
        durationSeconds: row.durationSeconds,
        direction: row.direction,
        sourceSummary: row.sourceSummary,
        extractedData: row.extractedData,
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
      configuration: {
        id: row.configId,
        source: normalizeConfigSource(row.configSource),
        sourceHash: row.configSourceHash,
        capturedAt: row.configCapturedAt.toISOString(),
        configuration: row.configuration,
        evidenceCapabilities: row.evidenceCapabilities,
      },
      criterionResults: results,
      recommendations: recommendationRows,
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
          payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
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
        payload: {
          callId,
          agentId: call.agentId,
          runReason: 'manual',
          requestKey: requestId,
        },
      });
      return { requestId, status: 'queued' as const };
    });
  }

  async reanalyzeAgent(
    locationId: string,
    agentId: string,
    window: AgentReanalysisWindow,
  ): Promise<AgentReanalysisResponse> {
    const duration = window === '24h' ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
    const cutoff = new Date(Date.now() - duration);
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
              payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
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
      {
        status: 'not_analyzed' | 'processing' | 'completed' | 'failed';
        summary: AgentSummary;
      }
    >();
    if (agentIds.length === 0) return summaries;
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
      if (rows.length === 0) continue;
      const completed = rows.filter(({ status }) => status === 'completed');
      const flaggedIssueCount = rows.reduce(
        (total, row) => total + (failuresByAnalysis.get(row.id) ?? 0),
        0,
      );
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
          flaggedIssueCount,
          callsWithFailures: rows.filter((row) => (failuresByAnalysis.get(row.id) ?? 0) > 0).length,
        },
      });
    }
    return summaries;
  }

  private async loadCriteria(agentId: string): Promise<AgentAnalysisDetail['successCriteria']> {
    const rows = await this.databaseService.client
      .select({
        id: successCriteria.id,
        stableKey: successCriteria.stableKey,
        origin: successCriteria.origin,
        criterionClass: successCriteria.criterionClass,
        lifecycleState: successCriteria.lifecycleState,
        versionId: successCriterionVersions.id,
        version: successCriterionVersions.version,
        title: successCriterionVersions.title,
        naturalLanguageRule: successCriterionVersions.naturalLanguageRule,
        applicabilityDefinition: successCriterionVersions.applicabilityDefinition,
        requiredEvidence: successCriterionVersions.requiredEvidence,
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
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latest.has(row.id)) latest.set(row.id, row);
    const versions = [...latest.values()];
    const versionIds = versions.map(({ versionId }) => versionId);
    const results = versionIds.length
      ? await this.databaseService.client
          .select({
            criterionVersionId: criterionResults.criterionVersionId,
            result: criterionResults.result,
          })
          .from(criterionResults)
          .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
          .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
          .where(
            and(
              eq(callAnalysisRuns.isCurrent, true),
              eq(voiceCalls.agentId, agentId),
              inArray(criterionResults.criterionVersionId, versionIds),
            ),
          )
      : [];
    const distributions = new Map<string, ReturnType<typeof emptyDistribution>>();
    for (const result of results) {
      const distribution = distributions.get(result.criterionVersionId) ?? emptyDistribution();
      if (result.result === 'pass') distribution.pass += 1;
      else if (result.result === 'fail') distribution.fail += 1;
      else if (result.result === 'not_applicable') distribution.notApplicable += 1;
      else distribution.unknown += 1;
      distributions.set(result.criterionVersionId, distribution);
    }
    return versions.map((row) => ({
      ...row,
      origin: normalizeOrigin(row.origin),
      criterionClass: normalizeCriterionClass(row.criterionClass),
      lifecycleState: normalizeCriterionLifecycle(row.lifecycleState),
      resultDistribution: distributions.get(row.versionId) ?? emptyDistribution(),
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
    const hasNextPage = rows.length > page.limit;
    const pageRows = rows.slice(0, page.limit);
    const analysisIds = pageRows.flatMap(({ analysisId }) => (analysisId ? [analysisId] : []));
    const failures = analysisIds.length
      ? await this.databaseService.client
          .select({
            analysisId: criterionResults.analysisRunId,
            criterionVersionId: criterionResults.criterionVersionId,
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
      ({ criterionVersionId }) => criterionVersionId,
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
        failedCriterionVersionIds: row.analysisId
          ? [...new Set(criteriaByAnalysis.get(row.analysisId) ?? [])]
          : [],
      })),
      nextCursor: hasNextPage && last ? encodeCallCursor(last.createdAt, last.id) : null,
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
        criterionVersionId: successCriterionVersions.id,
        stableKey: successCriteria.stableKey,
        title: successCriterionVersions.title,
        origin: successCriteria.origin,
        criterionClass: successCriteria.criterionClass,
        result: criterionResults.result,
        rationale: criterionResults.rationale,
      })
      .from(criterionResults)
      .innerJoin(
        successCriterionVersions,
        eq(successCriterionVersions.id, criterionResults.criterionVersionId),
      )
      .innerJoin(successCriteria, eq(successCriteria.id, successCriterionVersions.criterionId))
      .where(eq(criterionResults.analysisRunId, analysisRunId));
    const evidence = await this.loadEvidence(rows.map(({ id }) => id));
    return rows.map((row) => ({
      ...row,
      origin: normalizeOrigin(row.origin),
      criterionClass: normalizeCriterionClass(row.criterionClass),
      result: normalizeCriterionResult(row.result),
      evidence: evidence.get(row.id) ?? [],
    }));
  }

  private async loadEvidence(resultIds: string[]) {
    if (resultIds.length === 0) {
      return new Map<string, CallAnalysisDetail['criterionResults'][number]['evidence']>();
    }
    const rows = await this.databaseService.client
      .select({
        resultId: criterionResultEvidence.criterionResultId,
        turnId: callTurns.id,
        turnOrdinal: callTurns.ordinal,
        speaker: callTurns.speaker,
        text: callTurns.text,
      })
      .from(criterionResultEvidence)
      .innerJoin(callTurns, eq(callTurns.id, criterionResultEvidence.callTurnId))
      .where(inArray(criterionResultEvidence.criterionResultId, resultIds));
    return groupValues(
      rows,
      ({ resultId }) => resultId,
      (row) => ({
        turnId: row.turnId,
        turnOrdinal: row.turnOrdinal,
        speaker: normalizeSpeaker(row.speaker),
        text: row.text,
      }),
    );
  }

  private async loadCallRecommendations(analysisRunId: string): Promise<Recommendation[]> {
    const rows = await this.recommendationRows(eq(criterionResults.analysisRunId, analysisRunId));
    const evidence = await this.loadEvidence(
      rows.map(({ criterionResultId }) => criterionResultId),
    );
    return rows.map((row) => ({
      ...serializeRecommendation(row),
      scope: 'call' as const,
      supportingCallCount: 1,
      evidenceTurnIds: (evidence.get(row.criterionResultId) ?? []).map(({ turnId }) => turnId),
    }));
  }

  private async loadAgentRecommendations(agentId: string): Promise<Recommendation[]> {
    const rows = await this.recommendationRows(
      and(eq(voiceCalls.agentId, agentId), eq(callAnalysisRuns.isCurrent, true)),
    );
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.criterionVersionId}:${row.targetId}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map((group) => ({
      ...serializeRecommendation(group[0]!),
      scope: 'agent' as const,
      supportingCallCount: new Set(group.map(({ callId }) => callId)).size,
      evidenceTurnIds: [],
    }));
  }

  private recommendationRows(condition: SQL | undefined) {
    return this.databaseService.client
      .select({
        id: recommendations.id,
        criterionResultId: recommendations.criterionResultId,
        criterionId: successCriteria.id,
        criterionVersionId: successCriterionVersions.id,
        callId: voiceCalls.id,
        targetId: recommendations.targetId,
        type: recommendations.type,
        title: recommendations.title,
        reason: recommendations.reason,
        proposedChange: recommendations.proposedChange,
        uiPath: recommendations.uiPath,
      })
      .from(recommendations)
      .innerJoin(criterionResults, eq(criterionResults.id, recommendations.criterionResultId))
      .innerJoin(
        successCriterionVersions,
        eq(successCriterionVersions.id, criterionResults.criterionVersionId),
      )
      .innerJoin(successCriteria, eq(successCriteria.id, successCriterionVersions.criterionId))
      .innerJoin(callAnalysisRuns, eq(callAnalysisRuns.id, criterionResults.analysisRunId))
      .innerJoin(voiceCalls, eq(voiceCalls.id, callAnalysisRuns.callId))
      .where(condition)
      .orderBy(desc(recommendations.createdAt));
  }
}

function serializeRecommendation(row: {
  id: string;
  criterionId: string;
  criterionVersionId: string;
  targetId: string;
  type: string;
  title: string;
  reason: string;
  proposedChange: string;
  uiPath: string | null;
}) {
  return {
    id: row.id,
    criterionId: row.criterionId,
    criterionVersionId: row.criterionVersionId,
    targetId: row.targetId,
    type: 'prompt' as const,
    title: row.title,
    reason: row.reason,
    proposedChange: row.proposedChange,
    uiPath: row.uiPath,
  };
}

function serializeConfiguration(snapshot: typeof agentConfigSnapshots.$inferSelect) {
  return {
    id: snapshot.id,
    source: normalizeConfigSource(snapshot.source),
    sourceHash: snapshot.sourceHash,
    capturedAt: snapshot.capturedAt.toISOString(),
    configuration: snapshot.configuration,
    evidenceCapabilities: snapshot.evidenceCapabilities,
  };
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

function normalizeConfigSource(value: string) {
  return value === 'fixture' || value === 'user_supplemented' ? value : ('highlevel_api' as const);
}

function normalizeOrigin(value: string) {
  return value === 'prompt_generated' || value === 'user_defined' || value === 'configuration'
    ? value
    : ('universal' as const);
}

function normalizeCriterionClass(value: string) {
  return value === 'adherence' || value === 'safety' || value === 'diagnostic'
    ? value
    : ('outcome' as const);
}

function normalizeCriterionLifecycle(value: string) {
  return value === 'active' || value === 'retired' ? value : ('draft' as const);
}

function normalizeCriterionResult(value: string) {
  return value === 'pass' || value === 'fail' || value === 'not_applicable'
    ? value
    : ('unknown' as const);
}
