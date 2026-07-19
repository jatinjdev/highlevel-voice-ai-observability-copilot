import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to run migrations.');

  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  } finally {
    await pool.end();
  }
}

void run();
