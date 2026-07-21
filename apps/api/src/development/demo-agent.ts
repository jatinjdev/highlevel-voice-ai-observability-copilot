import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateEnvironment, type Environment } from '../config/environment.schema';
import { DatabaseService } from '../database/database.service';
import type { HighLevelClient } from '../highlevel/highlevel.client';
import { ObservabilityService } from '../observability/observability.service';
import { RecommendationCommandsService } from '../observability/recommendation-commands.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { loadDemoAgentFixture } from './demo-agent.fixture';
import { DemoAgentRunner, type DemoCommand } from './demo-agent.runner';
import { DemoAgentStore } from './demo-agent.store';

async function main(): Promise<void> {
  loadEnvironmentFiles();
  const options = readOptions(process.argv.slice(2));
  const fixture = await loadDemoAgentFixture(options.configPath);
  const configuration = new ConfigService<Environment, true>(
    validateEnvironment(process.env as Record<string, unknown>),
  );
  const database = new DatabaseService(configuration);

  try {
    const store = new DemoAgentStore(database);
    const unavailableHighLevelClient: Pick<HighLevelClient, 'get'> = {
      get: () => Promise.reject(new Error('Demo agents do not call HighLevel.')),
    };
    const pipeline = new PipelineService(database, unavailableHighLevelClient);
    const runner = new DemoAgentRunner(
      store,
      new ObservabilityService(database),
      new RecommendationCommandsService(database, pipeline),
    );
    const result = await runner.run(options.command, fixture, options.locationId);
    print(result);
    if (options.command === 'verify' && 'passed' in result && !result.passed) process.exitCode = 1;
  } finally {
    await database.onApplicationShutdown();
  }
}

function loadEnvironmentFiles(): void {
  const candidates = [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')];
  for (const path of new Set(candidates)) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function readOptions(arguments_: string[]): {
  command: DemoCommand;
  locationId: string;
  configPath: string;
} {
  const options = arguments_[0] === '--' ? arguments_.slice(1) : arguments_;
  const command = options[0];
  if (
    command !== 'seed' &&
    command !== 'analyze' &&
    command !== 'recommend' &&
    command !== 'verify'
  ) {
    throw new Error(
      'Usage: demo-agent <seed|analyze|recommend|verify> --location <id> [--config <path>]',
    );
  }
  const locationId = option(options, '--location') ?? process.env.DEMO_LOCATION_ID;
  if (!locationId) throw new Error('--location or DEMO_LOCATION_ID is required.');
  const configuredPath = option(options, '--config');
  const configPath = configuredPath ? resolve(configuredPath) : defaultFixturePath();
  return { command, locationId, configPath };
}

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  const value = index >= 0 ? arguments_[index + 1] : undefined;
  return value?.trim() || undefined;
}

function defaultFixturePath(): string {
  const candidates = [
    resolve(process.cwd(), 'fixtures/demo-agent.json'),
    resolve(process.cwd(), 'apps/api/fixtures/demo-agent.json'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
