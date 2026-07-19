import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PipelineService } from '../pipeline/pipeline.service';

async function main(): Promise<void> {
  const locationId = process.argv[2]?.trim();
  if (!locationId) {
    throw new Error('Usage: pnpm --filter @copilot/api sync:location <highlevel-location-id>');
  }

  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result = await application.get(PipelineService).sync(locationId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
