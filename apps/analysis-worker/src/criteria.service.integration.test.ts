import { locations, voiceAgents } from '@copilot/database';
import { config as loadEnvironment } from 'dotenv';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CriteriaService } from './criteria.service';
import { WorkerDatabaseService } from './database.service';

loadEnvironment({ path: resolve(__dirname, '../../../.env'), quiet: true });

describe.runIf(process.env.RUN_DATABASE_TESTS === '1')(
  'CriteriaService database integration',
  () => {
    let databaseService: WorkerDatabaseService | undefined;
    let agentId: string | undefined;

    afterEach(async () => {
      if (databaseService && agentId) {
        await databaseService.client.delete(voiceAgents).where(eq(voiceAgents.id, agentId));
      }
      await databaseService?.onApplicationShutdown();
    });

    it('resolves one criterion set when several calls for a new agent start concurrently', async () => {
      databaseService = new WorkerDatabaseService({
        get: () => process.env.DATABASE_URL,
      } as never);
      const [location] = await databaseService.client
        .insert(locations)
        .values({ highLevelLocationId: 'eval-criteria-concurrency-location' })
        .onConflictDoUpdate({
          target: locations.highLevelLocationId,
          set: { updatedAt: new Date() },
        })
        .returning({ id: locations.id });
      const [agent] = await databaseService.client
        .insert(voiceAgents)
        .values({
          locationId: location!.id,
          highLevelAgentId: `eval-criteria-concurrency-${randomUUID()}`,
          name: 'Evaluation Agent · Criteria Concurrency',
        })
        .returning({ id: voiceAgents.id });
      agentId = agent!.id;
      const criteria = new CriteriaService(databaseService);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          criteria.resolve(agentId!, { agentPrompt: 'Help callers accurately.' }),
        ),
      );

      expect(new Set(results.map(({ id }) => id)).size).toBe(1);
      expect(new Set(results.map(({ fingerprint }) => fingerprint)).size).toBe(1);
      expect(results[0]?.criteria).toHaveLength(9);
    });
  },
);
