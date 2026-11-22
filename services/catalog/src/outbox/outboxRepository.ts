import type { Pool } from '../db/pool.js';

export interface ClaimedOutboxEvent {
  id: string;
  payload: unknown;
  publish_attempt_count: number;
}

/**
 * Claims committed, unpublished events using FOR UPDATE SKIP LOCKED plus a lease, so
 * concurrent publishers never claim the same row and a crashed publisher's claims
 * become eligible again once the lease expires.
 */
export class OutboxRepository {
  constructor(private readonly pool: Pool) {}

  async claimBatch(publisherId: string, batchSize: number, leaseMs: number): Promise<ClaimedOutboxEvent[]> {
    const result = await this.pool.query<ClaimedOutboxEvent>(
      `UPDATE outbox_events o
          SET claimed_by = $1,
              claim_expires_at = now() + ($3::int * interval '1 millisecond'),
              publish_attempt_count = o.publish_attempt_count + 1
        WHERE o.id IN (
          SELECT id FROM outbox_events
           WHERE published_at IS NULL
             AND (claim_expires_at IS NULL OR claim_expires_at < now())
           ORDER BY created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
        RETURNING o.id, o.payload, o.publish_attempt_count`,
      [publisherId, batchSize, leaseMs],
    );
    return result.rows;
  }

  async markPublished(id: string, publisherId: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events SET published_at = now(), claimed_by = NULL, claim_expires_at = NULL, last_publish_error = NULL
        WHERE id = $1 AND claimed_by = $2 AND published_at IS NULL`,
      [id, publisherId],
    );
  }

  /** Keeps the row unpublished; it becomes claimable again after retryDelayMs. */
  async markFailed(id: string, publisherId: string, error: string, retryDelayMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events SET claimed_by = NULL, claim_expires_at = now() + ($4::int * interval '1 millisecond'), last_publish_error = $3
        WHERE id = $1 AND claimed_by = $2 AND published_at IS NULL`,
      [id, publisherId, error.slice(0, 500), retryDelayMs],
    );
  }
}
