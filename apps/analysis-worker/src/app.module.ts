import { SqsDomainEventConsumer } from '@copilot/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

import { AnalysisService } from './analysis.service';
import { CALL_OVERVIEW_GENERATOR, CallAnalyzer, CRITERION_EVALUATOR } from './call-analyzer';
import {
  DisabledCallOverviewGenerator,
  ModelCallOverviewGenerator,
} from './call-overview-generator';
import { ANALYSIS_EVENT_CONSUMER, AnalysisConsumerService } from './consumer.service';
import { CriteriaService } from './criteria.service';
import { DisabledCriterionEvaluator, ModelCriterionEvaluator } from './criterion-evaluator';
import { WorkerDatabaseService } from './database.service';
import { validateWorkerEnvironment, type WorkerEnvironment } from './environment';
import { LANGUAGE_MODEL, type StructuredOutputLanguageModel } from './language-model';
import { OpenAiCompatibleLanguageModel } from './providers/openai-compatible-language-model';
import { RecommendationGenerator } from './recommendation-generator';
import { RecommendationService } from './recommendation.service';

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
    CriteriaService,
    CallAnalyzer,
    AnalysisService,
    {
      provide: LANGUAGE_MODEL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<WorkerEnvironment, true>) => {
        const provider = configService.get('LLM_PROVIDER', { infer: true });
        if (provider === 'none') return null;
        return new OpenAiCompatibleLanguageModel({
          apiKey: configService.get('LLM_API_KEY', { infer: true }),
          baseUrl: configService.get('LLM_BASE_URL', { infer: true }),
          model: configService.get('LLM_MODEL', { infer: true }),
          providerId: configService.get('LLM_PROVIDER_ID', { infer: true }),
          structuredOutputMode: configService.get('LLM_STRUCTURED_OUTPUT_MODE', {
            infer: true,
          }),
          maxOutputTokens: configService.get('LLM_MAX_OUTPUT_TOKENS', { infer: true }),
          temperature: configService.get('LLM_TEMPERATURE', { infer: true }),
          requestTimeoutMs: configService.get('LLM_REQUEST_TIMEOUT_MS', { infer: true }),
          extraBody: configService.get('LLM_EXTRA_BODY_JSON', { infer: true }),
        });
      },
    },
    {
      provide: CRITERION_EVALUATOR,
      inject: [LANGUAGE_MODEL],
      useFactory: (languageModel: StructuredOutputLanguageModel | null) =>
        languageModel
          ? new ModelCriterionEvaluator(languageModel)
          : new DisabledCriterionEvaluator(),
    },
    {
      provide: CALL_OVERVIEW_GENERATOR,
      inject: [LANGUAGE_MODEL],
      useFactory: (languageModel: StructuredOutputLanguageModel | null) =>
        languageModel
          ? new ModelCallOverviewGenerator(languageModel)
          : new DisabledCallOverviewGenerator(),
    },
    RecommendationGenerator,
    RecommendationService,
    {
      provide: ANALYSIS_EVENT_CONSUMER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<WorkerEnvironment, true>) =>
        new SqsDomainEventConsumer({
          region: configService.get('AWS_REGION', { infer: true }),
          queueUrl: configService.get('SQS_ANALYSIS_QUEUE_URL', { infer: true }),
          endpoint: configService.get('SQS_ENDPOINT', { infer: true }),
          visibilityTimeoutSeconds: 360,
          maxNumberOfMessages: configService.get('ANALYSIS_CONCURRENCY', { infer: true }),
        }),
    },
    AnalysisConsumerService,
  ],
})
export class AppModule {}
