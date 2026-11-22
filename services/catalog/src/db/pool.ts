import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(connectionString: string, onIdleError: (error: Error) => void = () => undefined): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  // An idle client can be terminated by the server (restart, failover). Without a listener the
  // 'error' event crashes the process; the pool discards the client and reconnects on next use.
  pool.on('error', onIdleError);
  return pool;
}

/** Runs fn inside a transaction; commits on success, rolls back on any error. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
