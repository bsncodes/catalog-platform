import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool } from './pool.js';
import { runMigrations } from './migrator.js';

// Dedicated migration entry point (run as a one-shot job, never implicitly on service startup).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const directory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const pool = createPool(url, (error) => console.error("idle database connection error", error.message));
try {
  const applied = await runMigrations(pool, directory);
  console.log(applied.length ? `notification migrations complete (${applied.length} applied)` : 'notification schema up to date');
} catch (error) {
  console.error('notification migration failed', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
