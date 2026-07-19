import type { DomainEvent } from '@copilot/contracts';
import type { SendMessageCommandOutput } from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryDomainEventPublisher,
  SqsDomainEventConsumer,
  SqsDomainEventPublisher,
} from './index';

const event: DomainEvent = {
  type: 'call.ingestion.requested',
  version: 1,
  messageId: '10000000-0000-4000-8000-000000000001',
  correlationId: '10000000-0000-4000-8000-000000000002',
  causationId: null,
  occurredAt: '2026-07-15T10:00:00.000Z',
  tenant: {
    companyId: '10000000-0000-4000-8000-000000000003',
    locationId: '10000000-0000-4000-8000-000000000004',
  },
  data: {
    webhookInboxId: '10000000-0000-4000-8000-000000000005',
    highLevelCallId: 'call-1',
  },
};

describe('domain event publishers', () => {
  it('keeps a validated copy in memory for deterministic tests', async () => {
    const publisher = new InMemoryDomainEventPublisher();
    await publisher.publish(event);
    expect(publisher.events).toEqual([event]);
  });

  it('publishes the versioned envelope to the configured SQS queue', async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: 'sqs-message-1' });
    const publisher = new SqsDomainEventPublisher(
      {
        region: 'us-east-1',
        ingestionQueueUrl: 'http://localhost/ingestion',
        analysisQueueUrl: 'http://localhost/analysis',
      },
      { send: send as (command: never) => Promise<SendMessageCommandOutput> },
    );

    await publisher.publish(event);

    const command = send.mock.calls[0]?.[0];
    expect(command.input.QueueUrl).toBe('http://localhost/ingestion');
    expect(JSON.parse(command.input.MessageBody!)).toEqual(event);
  });

  it('bounds the number of messages claimed for one worker batch', async () => {
    const send = vi.fn().mockResolvedValue({ Messages: [] });
    const consumer = new SqsDomainEventConsumer(
      {
        region: 'us-east-1',
        queueUrl: 'http://localhost/analysis',
        maxNumberOfMessages: 3,
      },
      { send } as never,
    );

    await consumer.receive();

    expect(send.mock.calls[0]?.[0].input.MaxNumberOfMessages).toBe(3);
  });
});
