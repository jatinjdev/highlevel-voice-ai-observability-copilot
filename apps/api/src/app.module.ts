import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';

import { validateEnvironment } from './config/environment.schema';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HighLevelModule } from './highlevel/highlevel.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { SessionModule } from './session/session.module';
import { OutboxModule } from './outbox/outbox.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    HighLevelModule,
    ObservabilityModule,
    OutboxModule,
    SessionModule,
    PipelineModule,
  ],
})
export class AppModule {}
