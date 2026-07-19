import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { environmentSchema } from './config/environment.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const environment = environmentSchema.parse(process.env);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
  });
  app.use(helmet());
  app.enableShutdownHooks();

  if (environment.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Voice AI Observability Copilot API')
      .setDescription('Backend API for Voice AI call ingestion and analysis.')
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(environment.PORT, '0.0.0.0');
}

void bootstrap();
