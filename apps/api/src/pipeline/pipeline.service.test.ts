import type { HighLevelClient } from '../highlevel/highlevel.client';
import type { DatabaseService } from '../database/database.service';
import { describe, expect, it, vi } from 'vitest';

import { PipelineService } from './pipeline.service';

interface AgentRecord {
  id: string;
  internalLocationId: string;
  highLevelAgentId: string;
  source: string;
  companyId?: string | null;
}

const AGENT: AgentRecord = {
  id: '28fa0b73-c6dc-4fd4-8606-d272cb035187',
  internalLocationId: '620cf3a2-6d69-4cb1-b82a-54e885a78d0b',
  highLevelAgentId: 'highlevel-agent-1',
  source: 'highlevel',
};

function queryReturning<T>(rows: T[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function transactionReturning(
  previousPromptHash: string | null,
  criteriaInitializedAt: Date | null = new Date('2026-07-20T00:00:00.000Z'),
  previousConfigurationHash: string | null = null,
  configurationExists = true,
) {
  const insertedValues: unknown[] = [];
  const insert = vi.fn(() => {
    const statement = {
      values: vi.fn((value: unknown) => {
        insertedValues.push(value);
        return statement;
      }),
      onConflictDoUpdate: vi.fn(() => statement),
      onConflictDoNothing: vi.fn(() => statement),
      returning: vi.fn().mockResolvedValue([{ id: AGENT.id }]),
    };
    return statement;
  });
  const removeWhere = vi.fn().mockResolvedValue(undefined);
  const updateStatement = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  updateStatement.set.mockReturnValue(updateStatement);
  const transaction = {
    insert,
    select: vi.fn(() =>
      queryReturning(
        configurationExists
          ? [
              {
                promptHash: previousPromptHash,
                configurationHash: previousConfigurationHash,
                criteriaInitializedAt,
              },
            ]
          : [],
      ),
    ),
    delete: vi.fn(() => ({ where: removeWhere })),
    update: vi.fn(() => updateStatement),
  };
  return { transaction, insertedValues };
}

function setup(input: {
  agent?: AgentRecord;
  configuration?: {
    currentPrompt: string | null;
    promptHash: string | null;
    configuration: Record<string, unknown>;
    configurationHash: string | null;
  };
  remoteAgent?: Record<string, unknown>;
  previousPromptHash?: string | null;
  previousConfigurationHash?: string | null;
}) {
  const topLevelResults: unknown[][] = [[input.agent ?? AGENT]];
  if (input.configuration) topLevelResults.push([input.configuration]);
  const transactionFixture = transactionReturning(
    input.previousPromptHash ?? null,
    new Date('2026-07-20T00:00:00.000Z'),
    input.previousConfigurationHash ?? null,
  );
  const client = {
    select: vi.fn(() => queryReturning(topLevelResults.shift() ?? [])),
    update: vi.fn(),
    transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) =>
      work(transactionFixture.transaction),
    ),
  };
  const highLevelClient: Pick<HighLevelClient, 'get'> = {
    get: vi.fn().mockResolvedValue(
      input.remoteAgent ?? {
        id: AGENT.highLevelAgentId,
        locationId: 'location-1',
        agentName: 'Bakery assistant',
        agentPrompt: 'Help callers place accurate bakery orders.',
      },
    ),
  };
  const service = new PipelineService({ client } as unknown as DatabaseService, highLevelClient);
  return { service, client, highLevelClient, transactionFixture };
}

describe('PipelineService.refreshAgentConfiguration', () => {
  it('uses the authoritative fixture configuration for demo agents without calling HighLevel', async () => {
    const { service, client, highLevelClient } = setup({
      agent: { ...AGENT, source: 'demo' },
      configuration: {
        currentPrompt: 'Fixture prompt',
        promptHash: 'fixture-hash',
        configuration: { source: 'demo_fixture' },
        configurationHash: 'configuration-hash',
      },
    });

    await service.refreshAgentConfiguration('location-1', AGENT.id);

    expect(highLevelClient.get).not.toHaveBeenCalled();
    expect(client.transaction).not.toHaveBeenCalled();
  });

  it('repairs a legacy demo configuration that is missing its configuration hash', async () => {
    const updateStatement = {
      set: vi.fn(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    updateStatement.set.mockReturnValue(updateStatement);
    const { service, client, highLevelClient } = setup({
      agent: { ...AGENT, source: 'demo' },
      configuration: {
        currentPrompt: 'Fixture prompt',
        promptHash: 'fixture-hash',
        configuration: { source: 'demo_fixture' },
        configurationHash: null,
      },
    });
    client.update.mockReturnValue(updateStatement);

    await service.refreshAgentConfiguration('location-1', AGENT.id);

    expect(highLevelClient.get).not.toHaveBeenCalled();
    expect(updateStatement.set).toHaveBeenCalledWith({
      configurationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      updatedAt: expect.any(Date),
    });
  });

  it('refreshes and persists a real HighLevel configuration immediately', async () => {
    const { service, highLevelClient, transactionFixture } = setup({
      previousPromptHash: null,
    });

    await service.refreshAgentConfiguration('location-1', AGENT.id);

    expect(highLevelClient.get).toHaveBeenCalledWith(
      'location-1',
      '/voice-ai/agents/highlevel-agent-1',
    );
    expect(transactionFixture.insertedValues).toContainEqual(
      expect.objectContaining({
        agentId: AGENT.id,
        currentPrompt: 'Help callers place accurate bakery orders.',
        syncStatus: 'synced',
      }),
    );
  });

  it('invalidates existing guidance when HighLevel returns a changed configuration', async () => {
    const { service, transactionFixture } = setup({
      previousConfigurationHash: 'old-configuration-hash',
    });

    await service.refreshAgentConfiguration('location-1', AGENT.id);

    expect(transactionFixture.transaction.delete).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite stored configuration when HighLevel omits the prompt', async () => {
    const { service, client } = setup({
      remoteAgent: {
        id: AGENT.highLevelAgentId,
        locationId: 'location-1',
        agentName: 'Bakery assistant',
      },
    });

    await expect(service.refreshAgentConfiguration('location-1', AGENT.id)).rejects.toThrow(
      'HighLevel did not return the current agent prompt',
    );
    expect(client.transaction).not.toHaveBeenCalled();
  });
});

describe('PipelineService.discoverAgents', () => {
  it('paginates the HighLevel catalogue and persists agents without fetching calls', async () => {
    const transactionFixture = transactionReturning(null, null, null, false);
    const locationInsert = {
      values: vi.fn(),
      onConflictDoUpdate: vi.fn(),
      returning: vi
        .fn()
        .mockResolvedValue([{ id: '620cf3a2-6d69-4cb1-b82a-54e885a78d0b', companyId: null }]),
    };
    locationInsert.values.mockReturnValue(locationInsert);
    locationInsert.onConflictDoUpdate.mockReturnValue(locationInsert);
    const client = {
      insert: vi.fn(() => locationInsert),
      transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) =>
        work(transactionFixture.transaction),
      ),
    };
    const highLevelClient: Pick<HighLevelClient, 'get'> = {
      get: vi.fn().mockResolvedValue({
        total: 1,
        page: 1,
        pageSize: 50,
        agents: [
          {
            id: AGENT.highLevelAgentId,
            locationId: 'location-1',
            agentName: 'Bakery assistant',
            agentPrompt: 'Help callers place accurate bakery orders.',
          },
        ],
      }),
    };
    const service = new PipelineService({ client } as unknown as DatabaseService, highLevelClient);

    await expect(service.discoverAgents('location-1')).resolves.toEqual({
      discoveredAgentCount: 1,
    });

    expect(highLevelClient.get).toHaveBeenCalledWith('location-1', '/voice-ai/agents', {
      page: '1',
      pageSize: '50',
    });
    expect(highLevelClient.get).not.toHaveBeenCalledWith(
      'location-1',
      '/voice-ai/dashboard/call-logs',
      expect.anything(),
    );
    expect(transactionFixture.insertedValues).toContainEqual(
      expect.objectContaining({
        highLevelAgentId: AGENT.highLevelAgentId,
        name: 'Bakery assistant',
      }),
    );
    expect(transactionFixture.insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: AGENT.id,
          name: 'Customer outcome',
          source: 'default',
        }),
      ]),
    );
  });

  it('does not overwrite a detailed configuration or delete recommendations with catalogue data', async () => {
    const transactionFixture = transactionReturning(
      'stored-prompt-hash',
      new Date('2026-07-20T00:00:00.000Z'),
      'stored-configuration-hash',
    );
    const locationInsert = {
      values: vi.fn(),
      onConflictDoUpdate: vi.fn(),
      returning: vi
        .fn()
        .mockResolvedValue([{ id: '620cf3a2-6d69-4cb1-b82a-54e885a78d0b', companyId: null }]),
    };
    locationInsert.values.mockReturnValue(locationInsert);
    locationInsert.onConflictDoUpdate.mockReturnValue(locationInsert);
    const client = {
      insert: vi.fn(() => locationInsert),
      transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) =>
        work(transactionFixture.transaction),
      ),
    };
    const highLevelClient: Pick<HighLevelClient, 'get'> = {
      get: vi.fn().mockResolvedValue({
        total: 1,
        page: 1,
        pageSize: 50,
        agents: [
          {
            id: AGENT.highLevelAgentId,
            locationId: 'location-1',
            agentName: 'Bakery assistant',
            agentPrompt: 'A partial catalogue prompt.',
          },
        ],
      }),
    };
    const service = new PipelineService({ client } as unknown as DatabaseService, highLevelClient);

    await service.discoverAgents('location-1');

    expect(transactionFixture.transaction.delete).not.toHaveBeenCalled();
    expect(transactionFixture.insertedValues).not.toContainEqual(
      expect.objectContaining({ currentPrompt: 'A partial catalogue prompt.' }),
    );
  });
});

describe('PipelineService.analyzeAgentWindow', () => {
  it('fetches one agent window and queues every discovered call through ingestion', async () => {
    const { service, highLevelClient, transactionFixture } = setup({
      agent: { ...AGENT, companyId: null },
    });
    vi.mocked(highLevelClient.get).mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: 50,
      callLogs: [
        {
          id: 'highlevel-call-1',
          agentId: AGENT.highLevelAgentId,
          transcript: 'Bot: How can I help?\nHuman: I need assistance.',
          duration: 12,
          createdAt: '2026-07-20T10:00:00.000Z',
        },
      ],
    });

    const result = await service.analyzeAgentWindow('location-1', AGENT.id, '24h');

    expect(highLevelClient.get).toHaveBeenCalledWith(
      'location-1',
      '/voice-ai/dashboard/call-logs',
      expect.objectContaining({
        agentId: AGENT.highLevelAgentId,
        page: '1',
        pageSize: '50',
        sortBy: 'createdAt',
      }),
    );
    expect(result).toMatchObject({
      window: '24h',
      discoveredCallCount: 1,
      queuedCallCount: 1,
      status: 'queued',
    });
    expect(transactionFixture.insertedValues).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'VoiceAiCallEnd',
            idempotencyKey: expect.stringContaining('analysis-import:'),
          }),
        ]),
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'call.ingestion.requested',
            payload: expect.objectContaining({ highLevelCallId: 'highlevel-call-1' }),
          }),
        ]),
      ]),
    );
    expect(transactionFixture.transaction.delete).not.toHaveBeenCalled();
  });
});
