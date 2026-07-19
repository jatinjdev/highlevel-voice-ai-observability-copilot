import { SqsDomainEventConsumer } from '@copilot/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

import { INGESTION_EVENT_CONSUMER, IngestionConsumerService } from './consumer.service';
import { WorkerDatabaseService } from './database.service';
import { validateWorkerEnvironment, type WorkerEnvironment } from './environment';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      validate: validateWorkerEnvironment,
    }),
  ],
  providers: [
    WorkerDatabaseService,
    IngestionService,
    {
      provide: INGESTION_EVENT_CONSUMER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<WorkerEnvironment, true>) =>
        new SqsDomainEventConsumer({
          region: configService.get('AWS_REGION', { infer: true }),
          queueUrl: configService.get('SQS_INGESTION_QUEUE_URL', { infer: true }),
          endpoint: configService.get('SQS_ENDPOINT', { infer: true }),
        }),
    },
    IngestionConsumerService,
  ],
})
export class AppModule {}
