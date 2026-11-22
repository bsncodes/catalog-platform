import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { createPool } from '../../src/db/pool.js';
import { setupTestDatabase } from './db.js';

let admin: pg.Pool;

beforeAll(async () => {
  admin = await setupTestDatabase();
});
afterAll(async () => admin.end());

describe('createPool (RV2-01)', () => {
  it('survives the server terminating an idle connection and serves the next query', async () => {
    const url = new URL(process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:local-admin-password@127.0.0.1:55432/postgres');
    url.pathname = '/catalog_it';
    const onIdleError = vi.fn();
    const pool = createPool(url.toString(), onIdleError);
    try {
      const pid = (await pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
      await vi.waitFor(() => expect(onIdleError).toHaveBeenCalled(), { timeout: 3000 });
      expect((await pool.query<{ ok: number }>('SELECT 1 AS ok')).rows[0]!.ok).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
