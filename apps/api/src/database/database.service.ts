import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Environment } from '../config/environment.schema';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private pool?: Pool;
  private database?: NodePgDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService<Environment, true>) {}

  get client(): NodePgDatabase<typeof schema> {
    if (!this.database) {
      const connectionString = this.configService.get('DATABASE_URL', { infer: true });
      if (!connectionString) {
        throw new Error('DATABASE_URL is required before using the database.');
      }

      this.pool = new Pool({ connectionString, max: 10 });
      this.database = drizzle(this.pool, { schema });
    }

    return this.database;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}
