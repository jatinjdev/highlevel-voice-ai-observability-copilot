import { describe, expect, it } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as healthy', () => {
    const controller = new HealthController({} as DatabaseService);
    const response = controller.live();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('voice-ai-observability-api');
  });

  it('checks PostgreSQL before reporting readiness', async () => {
    let executed = false;
    const database = {
      client: {
        execute: () => {
          executed = true;
          return Promise.resolve();
        },
      },
    } as unknown as DatabaseService;

    const response = await new HealthController(database).ready();

    expect(executed).toBe(true);
    expect(response.status).toBe('ok');
  });
});
