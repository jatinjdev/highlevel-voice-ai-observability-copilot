import {
  messageOutbox,
  recommendationGenerationStates,
  successCriteria,
  webhookInbox,
} from '@copilot/database';
import { describe, expect, it, vi } from 'vitest';

import { RecommendationCommandsService } from './recommendation-commands.service';

const context = {
  companyId: '4f34303f-f7dd-4aa4-a54c-1210be82d528',
  locationId: '73ff8a09-8d8e-45ec-a80a-94e54fdce6ed',
};
const criteria = [
  { id: 'c11e6d46-8aa8-45ad-a205-a2c7869c33b1' },
  { id: 'e06954c8-e9d3-46ae-948b-c5782204d75c' },
];

function query(result: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function setup(eligibleCriteria = criteria) {
  const inboxRows: Array<Record<string, unknown>> = [];
  const stateRows: Array<Record<string, unknown>> = [];
  const outboxRows: Array<Record<string, unknown>> = [];
  const transaction = {
    insert: vi.fn((table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        if (table === webhookInbox) {
          inboxRows.push(value);
          return {
            returning: vi
              .fn()
              .mockResolvedValue([
                { id: `8fcb5d1a-4779-4787-92a4-${String(inboxRows.length).padStart(12, '0')}` },
              ]),
          };
        }
        if (table === recommendationGenerationStates) {
          stateRows.push(value);
          return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
        }
        if (table === messageOutbox) {
          outboxRows.push(value);
          return Promise.resolve(undefined);
        }
        throw new Error('Unexpected table insert.');
      },
    })),
  };
  const client = {
    select: vi.fn(() => query([context])),
    selectDistinct: vi.fn(() => query(eligibleCriteria)),
    transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<void>) =>
      work(transaction),
    ),
  };
  const pipeline = { refreshAgentConfiguration: vi.fn().mockResolvedValue(undefined) };
  const service = new RecommendationCommandsService({ client } as never, pipeline as never);

  return { client, inboxRows, outboxRows, pipeline, service, stateRows };
}

describe('RecommendationCommandsService.generateAll', () => {
  it('refreshes the current configuration once and queues one job per failed criterion', async () => {
    const { client, inboxRows, outboxRows, pipeline, service, stateRows } = setup();

    const result = await service.generateAll('highlevel-location', 'agent-id');

    expect(pipeline.refreshAgentConfiguration).toHaveBeenCalledOnce();
    expect(pipeline.refreshAgentConfiguration).toHaveBeenCalledWith(
      'highlevel-location',
      'agent-id',
    );
    expect(client.selectDistinct).toHaveBeenCalledWith({
      id: successCriteria.id,
      createdAt: successCriteria.createdAt,
    });
    expect(result).toMatchObject({
      criterionIds: criteria.map(({ id }) => id),
      queuedCriterionCount: 2,
      status: 'queued',
    });
    expect(inboxRows).toHaveLength(2);
    expect(stateRows.map(({ criterionId }) => criterionId)).toEqual(criteria.map(({ id }) => id));
    expect(outboxRows.map(({ aggregateId }) => aggregateId)).toEqual(criteria.map(({ id }) => id));
    expect(new Set(outboxRows.map(({ correlationId }) => correlationId))).toEqual(
      new Set([result.batchId]),
    );
  });

  it('returns an empty batch without opening a write transaction when no criteria failed', async () => {
    const { client, pipeline, service } = setup([]);

    const result = await service.generateAll('highlevel-location', 'agent-id');

    expect(pipeline.refreshAgentConfiguration).toHaveBeenCalledOnce();
    expect(client.transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      criterionIds: [],
      queuedCriterionCount: 0,
      status: 'no_failures',
    });
  });
});
