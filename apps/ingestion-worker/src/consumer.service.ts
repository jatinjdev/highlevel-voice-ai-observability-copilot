import type { DomainEventConsumer, DomainEventDelivery } from '@copilot/messaging';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { IngestionService } from './ingestion.service';

export const INGESTION_EVENT_CONSUMER = Symbol('INGESTION_EVENT_CONSUMER');

@Injectable()
export class IngestionConsumerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IngestionConsumerService.name);
  private stopping = false;

  constructor(
    @Inject(INGESTION_EVENT_CONSUMER) private readonly consumer: DomainEventConsumer,
    private readonly ingestionService: IngestionService,
  ) {}

  onApplicationBootstrap(): void {
    void this.consume();
  }

  onApplicationShutdown(): void {
    this.stopping = true;
  }

  private async consume(): Promise<void> {
    while (!this.stopping) {
      try {
        const deliveries = await this.consumer.receive();
        await Promise.all(deliveries.map((delivery) => this.handle(delivery)));
      } catch (error) {
        this.logger.error(
          'Ingestion queue receive failed.',
          error instanceof Error ? error.stack : undefined,
        );
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  private async handle(delivery: DomainEventDelivery): Promise<void> {
    try {
      const { event } = delivery;
      if (event.type === 'call.ingestion.requested') {
        await this.ingestionService.ingestCall(event);
      } else {
        throw new Error(`Ingestion worker cannot handle event ${event.type}.`);
      }
      await delivery.acknowledge();
    } catch (error) {
      this.logger.error(
        `Message ${delivery.providerMessageId} failed and will be retried.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
