import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { createPool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrator.js';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:local-admin-password@127.0.0.1:55432/postgres';
const TEST_DB = 'catalog_it';

/** Creates (once) and migrates an isolated integration-test database on the local compose PostgreSQL. */
export async function setupTestDatabase(): Promise<pg.Pool> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB}`;
  const pool = createPool(url.toString());
  await runMigrations(pool, join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'), () => undefined);
  return pool;
}

export async function resetTables(pool: pg.Pool): Promise<void> {
  await pool.query('TRUNCATE processed_events, outbox_events, catalog_enquiries');
}
