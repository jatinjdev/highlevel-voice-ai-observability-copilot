import * as schema from '@copilot/database';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { WorkerEnvironment } from './environment';

@Injectable()
export class WorkerDatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  readonly client: NodePgDatabase<typeof schema>;

  constructor(configService: ConfigService<WorkerEnvironment, true>) {
    this.pool = new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
      max: 10,
    });
    this.client = drizzle(this.pool, { schema });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
