import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule);
  application.enableShutdownHooks();
  new Logger('Bootstrap').log('Analysis worker is consuming call and agent analyses.');
}

void bootstrap();
