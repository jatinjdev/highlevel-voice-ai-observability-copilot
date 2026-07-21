import {
  DEFAULT_SUCCESS_CRITERIA,
  normalizeCriterionName,
  type AgentAnalysisRequestResponse,
  type AgentAnalysisWindow,
  type AgentDiscoveryResponse,
} from '@copilot/contracts';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import {
  agentRecommendations,
  locations,
  messageOutbox,
  recommendationGenerationStates,
  successCriteria,
  voiceAgents,
  voiceAgentConfigurations,
  voiceCalls,
  webhookInbox,
} from '../database/schema';
import { HighLevelClient } from '../highlevel/highlevel.client';
import { hashAgentConfiguration } from './agent-configuration';

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
  page: number;
  pageSize: number;
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
  translation?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface HighLevelCallPage {
  callLogs: HighLevelCall[];
  total: number;
  page: number;
  pageSize: number;
}

const HIGHLEVEL_PAGE_SIZE = 50;
const ANALYSIS_BATCH_SIZE = 250;
const WINDOW_MILLISECONDS: Record<AgentAnalysisWindow, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
};

@Injectable()
export class PipelineService {
  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(HighLevelClient)
    private readonly highLevelClient: Pick<HighLevelClient, 'get'>,
  ) {}

  /** Refreshes the Location's agent catalogue without importing any calls. */
  async discoverAgents(locationId: string): Promise<AgentDiscoveryResponse> {
    const [agents, tenantLocation] = await Promise.all([
      this.listAgents(locationId),
      this.resolveTenantLocation(locationId),
    ]);
    if (agents.length) {
      await this.databaseService.client.transaction(async (transaction) => {
        for (const agent of agents) {
          await this.persistHighLevelAgent(transaction, tenantLocation.id, agent, 'catalogue');
        }
      });
    }
    return { discoveredAgentCount: agents.length };
  }

  /**
   * Imports one agent's HighLevel calls for the selected window and queues their
   * normal ingestion path. Repeated imports update the canonical Call rows;
   * they never delete calls outside the selected window.
   */
  async analyzeAgentWindow(
    locationId: string,
    agentId: string,
    window: AgentAnalysisWindow,
  ): Promise<AgentAnalysisRequestResponse> {
    const [agent] = await this.databaseService.client
      .select({
        id: voiceAgents.id,
        internalLocationId: voiceAgents.locationId,
        highLevelAgentId: voiceAgents.highLevelAgentId,
        source: voiceAgents.source,
        companyId: locations.companyId,
      })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');

    const requestId = randomUUID();
    if (agent.source === 'demo') {
      return this.queueStoredDemoCalls(agent, window, requestId);
    }
    if (agent.source !== 'highlevel') {
      throw new UnprocessableEntityException(
        `Voice Agent source ${agent.source} cannot import HighLevel calls.`,
      );
    }

    const calls = await this.listAgentCalls(locationId, agent.highLevelAgentId, window);
    await this.queueImportedCalls(locationId, agent, calls, requestId);
    return {
      requestId,
      window,
      discoveredCallCount: calls.length,
      queuedCallCount: calls.length,
      status: calls.length ? 'queued' : 'no_calls',
    };
  }

  /**
   * Refreshes the complete public agent configuration immediately before
   * recommendation generation. Demo agents use their authoritative fixture;
   * real agents are refreshed from HighLevel.
   */
  async refreshAgentConfiguration(locationId: string, agentId: string): Promise<void> {
    const [agent] = await this.databaseService.client
      .select({
        id: voiceAgents.id,
        internalLocationId: voiceAgents.locationId,
        highLevelAgentId: voiceAgents.highLevelAgentId,
        source: voiceAgents.source,
      })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');

    if (agent.source === 'demo') {
      const [configuration] = await this.databaseService.client
        .select({
          currentPrompt: voiceAgentConfigurations.currentPrompt,
          configuration: voiceAgentConfigurations.configuration,
          configurationHash: voiceAgentConfigurations.configurationHash,
        })
        .from(voiceAgentConfigurations)
        .where(eq(voiceAgentConfigurations.agentId, agent.id))
        .limit(1);
      if (!configuration?.currentPrompt) {
        throw new UnprocessableEntityException(
          'The demo agent configuration is unavailable. Seed the fixture before generating recommendations.',
        );
      }
      if (!configuration.configurationHash) {
        await this.databaseService.client
          .update(voiceAgentConfigurations)
          .set({
            configurationHash: hashAgentConfiguration(
              configuration.currentPrompt,
              configuration.configuration,
            ),
            updatedAt: new Date(),
          })
          .where(eq(voiceAgentConfigurations.agentId, agent.id));
      }
      return;
    }

    if (agent.source !== 'highlevel') {
      throw new UnprocessableEntityException(
        `Voice Agent source ${agent.source} cannot provide a current prompt.`,
      );
    }

    const snapshot = await this.highLevelClient.get<HighLevelAgent>(
      locationId,
      `/voice-ai/agents/${encodeURIComponent(agent.highLevelAgentId)}`,
    );
    if (snapshot.id !== agent.highLevelAgentId) {
      throw new Error('HighLevel returned a different Voice Agent than the one requested.');
    }
    if (!snapshot.agentPrompt?.trim()) {
      throw new UnprocessableEntityException(
        'HighLevel did not return the current agent prompt. Recommendation generation requires a complete current configuration.',
      );
    }

    await this.databaseService.client.transaction(async (transaction) => {
      await this.persistHighLevelAgent(transaction, agent.internalLocationId, snapshot, 'detail');
    });
  }

  private async listAgents(locationId: string): Promise<HighLevelAgent[]> {
    const agents = new Map<string, HighLevelAgent>();
    for (let page = 1; page <= 5_000; page += 1) {
      const previousCount = agents.size;
      const response = await this.highLevelClient.get<HighLevelAgentPage>(
        locationId,
        '/voice-ai/agents',
        { page: String(page), pageSize: String(HIGHLEVEL_PAGE_SIZE) },
      );
      for (const agent of response.agents) agents.set(agent.id, agent);
      if (
        response.agents.length < HIGHLEVEL_PAGE_SIZE ||
        agents.size >= response.total ||
        agents.size === previousCount
      )
        break;
    }
    return [...agents.values()];
  }

  private async listAgentCalls(
    locationId: string,
    highLevelAgentId: string,
    window: AgentAnalysisWindow,
  ): Promise<HighLevelCall[]> {
    const endDate = Date.now();
    const startDate = endDate - WINDOW_MILLISECONDS[window];
    const calls = new Map<string, HighLevelCall>();
    for (let page = 1; page <= 5_000; page += 1) {
      const previousCount = calls.size;
      const response = await this.highLevelClient.get<HighLevelCallPage>(
        locationId,
        '/voice-ai/dashboard/call-logs',
        {
          agentId: highLevelAgentId,
          startDate: String(startDate),
          endDate: String(endDate),
          sortBy: 'createdAt',
          sort: 'ascend',
          page: String(page),
          pageSize: String(HIGHLEVEL_PAGE_SIZE),
        },
      );
      for (const call of response.callLogs) {
        if (call.agentId !== highLevelAgentId) {
          throw new Error('HighLevel returned a Call for a different Voice Agent.');
        }
        calls.set(call.id, call);
      }
      if (
        response.callLogs.length < HIGHLEVEL_PAGE_SIZE ||
        calls.size >= response.total ||
        calls.size === previousCount
      )
        break;
    }
    return [...calls.values()];
  }

  private async queueImportedCalls(
    highLevelLocationId: string,
    agent: {
      internalLocationId: string;
      companyId: string | null;
    },
    calls: HighLevelCall[],
    requestId: string,
  ): Promise<void> {
    const requests = calls.map((call) => {
      const inboxId = randomUUID();
      const payload = {
        ...call,
        type: 'VoiceAiCallEnd' as const,
        locationId: highLevelLocationId,
        extractedData: call.extractedData ?? {},
        executedCallActions: call.executedCallActions ?? [],
      };
      return { call, inboxId, payload, serialized: JSON.stringify(payload) };
    });
    await this.databaseService.client.transaction(async (transaction) => {
      for (let offset = 0; offset < requests.length; offset += ANALYSIS_BATCH_SIZE) {
        const batch = requests.slice(offset, offset + ANALYSIS_BATCH_SIZE);
        if (!batch.length) continue;
        await transaction.insert(webhookInbox).values(
          batch.map(({ call, inboxId, payload, serialized }) => ({
            id: inboxId,
            idempotencyKey: `analysis-import:${requestId}:${call.id}`,
            eventType: 'VoiceAiCallEnd',
            payloadSha256: createHash('sha256').update(serialized).digest('hex'),
            payload,
          })),
        );
        await transaction.insert(messageOutbox).values(
          batch.map(({ call, inboxId }) => ({
            sourceInboxId: inboxId,
            eventType: 'call.ingestion.requested',
            aggregateType: 'call',
            aggregateId: inboxId,
            correlationId: requestId,
            companyId: agent.companyId,
            locationId: agent.internalLocationId,
            payload: { webhookInboxId: inboxId, highLevelCallId: call.id },
          })),
        );
      }
    });
  }

  private async queueStoredDemoCalls(
    agent: {
      id: string;
      internalLocationId: string;
      companyId: string | null;
    },
    window: AgentAnalysisWindow,
    requestId: string,
  ): Promise<AgentAnalysisRequestResponse> {
    const cutoff = new Date(Date.now() - WINDOW_MILLISECONDS[window]);
    const calls = await this.databaseService.client
      .select({ id: voiceCalls.id })
      .from(voiceCalls)
      .where(and(eq(voiceCalls.agentId, agent.id), gte(voiceCalls.callCreatedAt, cutoff)))
      .orderBy(desc(voiceCalls.callCreatedAt));
    const requests = calls.map(({ id: callId }) => ({
      callId,
      inboxId: randomUUID(),
      requestKey: `${requestId}:${callId}`,
    }));
    await this.databaseService.client.transaction(async (transaction) => {
      for (let offset = 0; offset < requests.length; offset += ANALYSIS_BATCH_SIZE) {
        const batch = requests.slice(offset, offset + ANALYSIS_BATCH_SIZE);
        if (!batch.length) continue;
        await transaction.insert(webhookInbox).values(
          batch.map((request) => {
            const payload = {
              callId: request.callId,
              agentId: agent.id,
              runReason: 'manual',
              requestKey: request.requestKey,
            };
            return {
              id: request.inboxId,
              idempotencyKey: `analysis-request:${request.requestKey}`,
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
            correlationId: requestId,
            companyId: agent.companyId,
            locationId: agent.internalLocationId,
            payload: {
              callId: request.callId,
              agentId: agent.id,
              runReason: 'manual',
              requestKey: request.requestKey,
            },
          })),
        );
      }
    });
    return {
      requestId,
      window,
      discoveredCallCount: calls.length,
      queuedCallCount: calls.length,
      status: calls.length ? 'queued' : 'no_calls',
    };
  }

  private async resolveTenantLocation(locationId: string) {
    const [tenantLocation] = await this.databaseService.client
      .insert(locations)
      .values({ highLevelLocationId: locationId })
      .onConflictDoUpdate({
        target: locations.highLevelLocationId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: locations.id, companyId: locations.companyId });
    if (!tenantLocation) throw new Error(`Failed to resolve tenant location ${locationId}.`);
    return tenantLocation;
  }

  private async persistHighLevelAgent(
    transaction: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],
    internalLocationId: string,
    agent: HighLevelAgent,
    source: 'catalogue' | 'detail',
  ): Promise<string> {
    const [persistedAgent] = await transaction
      .insert(voiceAgents)
      .values({
        locationId: internalLocationId,
        highLevelAgentId: agent.id,
        name: agent.agentName,
        source: 'highlevel',
      })
      .onConflictDoUpdate({
        target: [voiceAgents.locationId, voiceAgents.highLevelAgentId],
        set: {
          name: agent.agentName,
          source: 'highlevel',
          lifecycleState: 'active',
          updatedAt: new Date(),
        },
      })
      .returning({ id: voiceAgents.id });
    if (!persistedAgent) throw new Error(`Failed to persist Voice Agent ${agent.id}.`);

    const currentPrompt = agent.agentPrompt ?? null;
    const promptHash = currentPrompt
      ? createHash('sha256').update(currentPrompt).digest('hex')
      : null;
    const configuration = { raw: agent };
    const configurationHash =
      source === 'detail' ? hashAgentConfiguration(currentPrompt, configuration) : null;
    const [previousConfiguration] = await transaction
      .select({
        promptHash: voiceAgentConfigurations.promptHash,
        configurationHash: voiceAgentConfigurations.configurationHash,
        criteriaInitializedAt: voiceAgentConfigurations.criteriaInitializedAt,
      })
      .from(voiceAgentConfigurations)
      .where(eq(voiceAgentConfigurations.agentId, persistedAgent.id))
      .limit(1);
    const configurationValues = {
      agentId: persistedAgent.id,
      currentPrompt,
      promptHash,
      configuration,
      configurationHash,
      syncStatus: source === 'detail' ? 'synced' : 'catalogued',
      syncedAt: new Date(),
    };
    if (source === 'detail') {
      await transaction
        .insert(voiceAgentConfigurations)
        .values(configurationValues)
        .onConflictDoUpdate({
          target: voiceAgentConfigurations.agentId,
          set: {
            currentPrompt,
            promptHash,
            configuration,
            configurationHash,
            syncStatus: 'synced',
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    } else if (!previousConfiguration) {
      await transaction
        .insert(voiceAgentConfigurations)
        .values(configurationValues)
        .onConflictDoNothing({ target: voiceAgentConfigurations.agentId });
    }
    if (!previousConfiguration?.criteriaInitializedAt) {
      await transaction
        .insert(successCriteria)
        .values(
          DEFAULT_SUCCESS_CRITERIA.map((criterion) => ({
            agentId: persistedAgent.id,
            name: criterion.name,
            normalizedName: normalizeCriterionName(criterion.name),
            description: criterion.description,
            source: 'default',
          })),
        )
        .onConflictDoNothing({ target: [successCriteria.agentId, successCriteria.normalizedName] });
      await transaction
        .update(voiceAgentConfigurations)
        .set({ criteriaInitializedAt: new Date(), updatedAt: new Date() })
        .where(eq(voiceAgentConfigurations.agentId, persistedAgent.id));
    }
    if (
      source === 'detail' &&
      previousConfiguration?.configurationHash &&
      previousConfiguration.configurationHash !== configurationHash
    ) {
      await transaction
        .delete(agentRecommendations)
        .where(eq(agentRecommendations.agentId, persistedAgent.id));
      await transaction
        .delete(recommendationGenerationStates)
        .where(eq(recommendationGenerationStates.agentId, persistedAgent.id));
    }
    return persistedAgent.id;
  }
}
