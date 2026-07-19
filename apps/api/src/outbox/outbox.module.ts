import { InMemoryDomainEventPublisher, SqsDomainEventPublisher } from '@copilot/messaging';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment.schema';
import { DOMAIN_EVENT_PUBLISHER } from './outbox.constants';
import { OutboxPublisherService } from './outbox-publisher.service';

@Module({
  providers: [
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment, true>) => {
        const enabled = configService.get('OUTBOX_PUBLISHER_ENABLED', { infer: true });
        const queueUrl = configService.get('SQS_INGESTION_QUEUE_URL', { infer: true });
        const analysisQueueUrl = configService.get('SQS_ANALYSIS_QUEUE_URL', { infer: true });
        if (!enabled || !queueUrl || !analysisQueueUrl) return new InMemoryDomainEventPublisher();
        return new SqsDomainEventPublisher({
          region: configService.get('AWS_REGION', { infer: true }),
          ingestionQueueUrl: queueUrl,
          analysisQueueUrl,
          endpoint: configService.get('SQS_ENDPOINT', { infer: true }),
        });
      },
    },
    OutboxPublisherService,
  ],
})
export class OutboxModule {}
