import type { PipelineSummary, PipelineSyncResponse } from '@copilot/contracts';
import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import {
  agentRecommendations,
  callAnalysisRuns,
  locations,
  messageOutbox,
  recommendationGenerationStates,
  voiceAgents,
  voiceAgentConfigurations,
  voiceCalls,
  webhookInbox,
} from '../database/schema';
import { HighLevelClient } from '../highlevel/highlevel.client';

interface HighLevelAgent {
  id: string;
  locationId: string;
  agentName: string;
  agentPrompt?: string;
  [key: string]: unknown;
}

interface HighLevelAgentPage {
  agents: HighLevelAgent[];
  total: number;
}

interface HighLevelCall {
  id: string;
  agentId: string;
  contactId?: string;
  transcript: string;
  summary?: string;
  duration: number;
  trialCall?: boolean;
  createdAt: string;
  extractedData?: Record<string, unknown>;
  executedCallActions?: unknown[];
  translation?: Record<string, unknown>;
}

interface HighLevelCallPage {
  callLogs: HighLevelCall[];
  total: number;
}

@Injectable()
export class PipelineService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly highLevelClient: HighLevelClient,
  ) {}

  async sync(locationId: string): Promise<PipelineSyncResponse> {
    const [agentPage, callPage] = await Promise.all([
      this.highLevelClient.get<HighLevelAgentPage>(locationId, '/voice-ai/agents'),
      this.highLevelClient.get<HighLevelCallPage>(locationId, '/voice-ai/dashboard/call-logs'),
    ]);
    const agents: HighLevelAgent[] = [];
    for (const agent of agentPage.agents) {
      agents.push(
        await this.highLevelClient.get<HighLevelAgent>(
          locationId,
          `/voice-ai/agents/${encodeURIComponent(agent.id)}`,
        ),
      );
    }

    const [tenantLocation] = await this.databaseService.client
      .insert(locations)
      .values({ highLevelLocationId: locationId })
      .onConflictDoUpdate({
        target: locations.highLevelLocationId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: locations.id, companyId: locations.companyId });
    if (!tenantLocation) throw new Error(`Failed to resolve tenant location ${locationId}.`);

    for (const agent of agents) {
      await this.databaseService.client.transaction(async (transaction) => {
        const [persistedAgent] = await transaction
          .insert(voiceAgents)
          .values({
            locationId: tenantLocation.id,
            highLevelAgentId: agent.id,
            name: agent.agentName,
          })
          .onConflictDoUpdate({
            target: [voiceAgents.locationId, voiceAgents.highLevelAgentId],
            set: { name: agent.agentName, lifecycleState: 'active', updatedAt: new Date() },
          })
          .returning({ id: voiceAgents.id });
        if (!persistedAgent) throw new Error(`Failed to persist Voice Agent ${agent.id}.`);

        const currentPrompt = agent.agentPrompt ?? null;
        const configuration = { raw: agent };
        const promptHash = currentPrompt
          ? createHash('sha256').update(currentPrompt).digest('hex')
          : null;
        const [previousConfiguration] = await transaction
          .select({ promptHash: voiceAgentConfigurations.promptHash })
          .from(voiceAgentConfigurations)
          .where(eq(voiceAgentConfigurations.agentId, persistedAgent.id))
          .limit(1);
        await transaction
          .insert(voiceAgentConfigurations)
          .values({
            agentId: persistedAgent.id,
            currentPrompt,
            promptHash,
            configuration,
            syncStatus: 'synced',
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: voiceAgentConfigurations.agentId,
            set: {
              currentPrompt,
              promptHash,
              configuration,
              syncStatus: 'synced',
              syncedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        if (previousConfiguration?.promptHash && previousConfiguration.promptHash !== promptHash) {
          await transaction
            .delete(agentRecommendations)
            .where(eq(agentRecommendations.agentId, persistedAgent.id));
          await transaction
            .delete(recommendationGenerationStates)
            .where(eq(recommendationGenerationStates.agentId, persistedAgent.id));
        }
      });
    }

    for (const call of callPage.callLogs) {
      const payload = {
        type: 'VoiceAiCallEnd',
        locationId,
        ...call,
        extractedData: call.extractedData ?? {},
        executedCallActions: call.executedCallActions ?? [],
      };
      const serialized = JSON.stringify(payload);
      await this.databaseService.client.transaction(async (transaction) => {
        const [inbox] = await transaction
          .insert(webhookInbox)
          .values({
            idempotencyKey: `backfill:${locationId}:${call.id}`,
            eventType: 'VoiceAiCallEnd',
            payloadSha256: createHash('sha256').update(serialized).digest('hex'),
            payload,
          })
          .onConflictDoNothing({ target: webhookInbox.idempotencyKey })
          .returning({ id: webhookInbox.id });
        if (!inbox) return;
        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: 'call.ingestion.requested',
          aggregateType: 'call',
          aggregateId: inbox.id,
          correlationId: inbox.id,
          companyId: tenantLocation.companyId,
          locationId: tenantLocation.id,
          payload: { webhookInboxId: inbox.id, highLevelCallId: call.id },
        });
      });
    }

    return {
      ...(await this.getSummary(locationId)),
      syncedAgents: agents.length,
      syncedCalls: callPage.callLogs.length,
    };
  }

  async getSummary(locationId: string): Promise<PipelineSummary> {
    const rows = await this.databaseService.client
      .select({
        id: voiceCalls.id,
        highLevelCallId: voiceCalls.highLevelCallId,
        highLevelAgentId: voiceAgents.highLevelAgentId,
        agentName: voiceAgents.name,
        createdAt: voiceCalls.callCreatedAt,
        ingestedAt: voiceCalls.ingestedAt,
        durationSeconds: voiceCalls.durationSeconds,
        trialCall: voiceCalls.isTrial,
        transcript: voiceCalls.sourceTranscript,
        analysisStatus: callAnalysisRuns.status,
        analysisProvider: callAnalysisRuns.provider,
        analysisSummary: callAnalysisRuns.lastError,
      })
      .from(voiceCalls)
      .innerJoin(voiceAgents, eq(voiceCalls.agentId, voiceAgents.id))
      .innerJoin(locations, eq(voiceCalls.locationId, locations.id))
      .leftJoin(
        callAnalysisRuns,
        and(eq(callAnalysisRuns.callId, voiceCalls.id), eq(callAnalysisRuns.isCurrent, true)),
      )
      .where(eq(locations.highLevelLocationId, locationId))
      .orderBy(desc(voiceCalls.callCreatedAt));

    const uniqueAgents = new Set(rows.map((row) => row.highLevelAgentId));
    const completedAnalyses = rows.filter((row) => row.analysisStatus === 'completed').length;
    const completedModels = rows
      .filter((row) => row.analysisStatus === 'completed')
      .map((row) => row.analysisProvider);
    const hasDeterministic = completedModels.some((provider) => provider === null);
    const hasSemantic = completedModels.some((provider) => provider !== null);
    const lastSyncedAt = rows.reduce<Date | null>((latest, row) => {
      if (!latest || row.ingestedAt > latest) return row.ingestedAt;
      return latest;
    }, null);

    return {
      agentsMonitored: uniqueAgents.size,
      callsIngested: rows.length,
      analysesCompleted: completedAnalyses,
      analysisMode:
        completedModels.length === 0
          ? 'unassessed'
          : hasDeterministic && hasSemantic
            ? 'mixed'
            : hasSemantic
              ? 'semantic'
              : 'deterministic',
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      calls: rows.map((row) => ({
        id: row.id,
        highLevelCallId: row.highLevelCallId,
        agentId: row.highLevelAgentId,
        agentName: row.agentName,
        createdAt: row.createdAt.toISOString(),
        durationSeconds: row.durationSeconds,
        trialCall: row.trialCall,
        hasTranscript: row.transcript.length > 0,
        analysisStatus:
          row.analysisStatus === 'queued' ||
          row.analysisStatus === 'processing' ||
          row.analysisStatus === 'completed' ||
          row.analysisStatus === 'failed'
            ? row.analysisStatus
            : 'not_queued',
        analysisMode:
          row.analysisStatus !== 'completed'
            ? null
            : row.analysisProvider === null
              ? 'deterministic'
              : 'semantic',
        analysisSummary: row.analysisSummary,
      })),
    };
  }
}
