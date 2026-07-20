import type { DomainEvent } from '@copilot/contracts';
import { domainEventSchema } from '@copilot/contracts';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface SqsDomainEventPublisherOptions {
  region: string;
  ingestionQueueUrl: string;
  analysisQueueUrl: string;
  endpoint?: string;
}

interface SqsSender {
  send(command: SendMessageCommand): Promise<SendMessageCommandOutput>;
}

interface SqsReceiver {
  send(command: ReceiveMessageCommand): Promise<{
    Messages?: Array<{ MessageId?: string; ReceiptHandle?: string; Body?: string }>;
  }>;
  send(command: DeleteMessageCommand): Promise<unknown>;
}

export interface DomainEventDelivery {
  readonly providerMessageId: string;
  readonly event: DomainEvent;
  acknowledge(): Promise<void>;
}

export interface DomainEventConsumer {
  receive(): Promise<DomainEventDelivery[]>;
}

export class SqsDomainEventPublisher implements DomainEventPublisher {
  private readonly client: SqsSender;

  constructor(
    private readonly options: SqsDomainEventPublisherOptions,
    client?: SqsSender,
  ) {
    this.client =
      client ??
      new SQSClient({
        region: options.region,
        ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      });
  }

  async publish(unvalidatedEvent: DomainEvent): Promise<void> {
    const event = domainEventSchema.parse(unvalidatedEvent);
    const response = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrlFor(event),
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: event.type },
          schemaVersion: { DataType: 'Number', StringValue: String(event.version) },
          correlationId: { DataType: 'String', StringValue: event.correlationId },
        },
      }),
    );
    if (!response.MessageId) throw new Error('SQS accepted the request without a MessageId.');
  }

  private queueUrlFor(event: DomainEvent): string {
    return event.type === 'call.analysis.requested' ||
      event.type === 'criterion.recommendation.requested'
      ? this.options.analysisQueueUrl
      : this.options.ingestionQueueUrl;
  }
}

export class InMemoryDomainEventPublisher implements DomainEventPublisher {
  readonly events: DomainEvent[] = [];

  publish(unvalidatedEvent: DomainEvent): Promise<void> {
    this.events.push(domainEventSchema.parse(unvalidatedEvent));
    return Promise.resolve();
  }
}

export interface SqsDomainEventConsumerOptions {
  region: string;
  queueUrl: string;
  endpoint?: string;
  waitTimeSeconds?: number;
  visibilityTimeoutSeconds?: number;
  maxNumberOfMessages?: number;
}

export class SqsDomainEventConsumer implements DomainEventConsumer {
  private readonly client: SqsReceiver;

  constructor(
    private readonly options: SqsDomainEventConsumerOptions,
    client?: SqsReceiver,
  ) {
    this.client =
      client ??
      new SQSClient({
        region: options.region,
        ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      });
  }

  async receive(): Promise<DomainEventDelivery[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.options.queueUrl,
        MaxNumberOfMessages: this.options.maxNumberOfMessages ?? 10,
        WaitTimeSeconds: this.options.waitTimeSeconds ?? 20,
        VisibilityTimeout: this.options.visibilityTimeoutSeconds ?? 60,
        MessageAttributeNames: ['All'],
      }),
    );

    return (response.Messages ?? []).map((message) => {
      if (!message.MessageId || !message.ReceiptHandle || !message.Body) {
        throw new Error('SQS returned a message without an ID, receipt handle, or body.');
      }
      const event = domainEventSchema.parse(JSON.parse(message.Body));
      return {
        providerMessageId: message.MessageId,
        event,
        acknowledge: async () => {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.options.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        },
      };
    });
  }
}
