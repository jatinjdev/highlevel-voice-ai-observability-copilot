import type { DomainEventConsumer, DomainEventDelivery } from '@copilot/messaging';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { AnalysisService } from './analysis.service';
import { RecommendationService } from './recommendation.service';

export const ANALYSIS_EVENT_CONSUMER = Symbol('ANALYSIS_EVENT_CONSUMER');

@Injectable()
export class AnalysisConsumerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AnalysisConsumerService.name);
  private stopping = false;

  constructor(
    @Inject(ANALYSIS_EVENT_CONSUMER) private readonly consumer: DomainEventConsumer,
    private readonly analysisService: AnalysisService,
    private readonly recommendationService: RecommendationService,
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
          'Analysis queue receive failed.',
          error instanceof Error ? error.stack : undefined,
        );
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  private async handle(delivery: DomainEventDelivery): Promise<void> {
    try {
      if (delivery.event.type === 'call.analysis.requested') {
        const result = await this.analysisService.analyze(delivery.event);
        if (result !== 'busy') await delivery.acknowledge();
        return;
      }
      if (delivery.event.type === 'criterion.recommendation.requested') {
        await this.recommendationService.generate(delivery.event);
        await delivery.acknowledge();
        return;
      }
      throw new Error(`Analysis worker cannot handle event ${delivery.event.type}.`);
    } catch (error) {
      this.logger.error(
        `Message ${delivery.providerMessageId} failed and will be retried.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
