import { randomUUID } from 'node:crypto';
import type { CatalogEnquirySubmittedV1 } from '@catalog/contracts';
import type { Pool } from './pool.js';

export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED';
export type CallbackStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface DeliveryRecord {
  id: string;
  event_id: string;
  enquiry_id: string;
  correlation_id: string | null;
  email_status: EmailStatus;
  callback_status: CallbackStatus | null;
  provider_message_id: string | null;
  attempt_count: number;
  callback_attempt_count: number;
  email_sent_at: Date | null;
  next_callback_retry_at: Date | null;
  last_callback_error: string | null;
}

const COLUMNS = `id, event_id, enquiry_id, correlation_id, email_status, callback_status, provider_message_id,
  attempt_count, callback_attempt_count, email_sent_at, next_callback_retry_at, last_callback_error`;

/**
 * Notification delivery ledger. Email-delivery progress and callback progress are tracked in
 * separate columns so their retries and errors remain independently observable.
 */
export class DeliveryRepository {
  constructor(private readonly pool: Pool) {}

  /** Idempotent: one ledger record per event id regardless of how often the message is delivered. */
  async ensureRecord(event: CatalogEnquirySubmittedV1): Promise<DeliveryRecord> {
    await this.pool.query(
      `INSERT INTO notification_deliveries (id, event_id, enquiry_id, event_type, event_version, entity_type, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id) DO NOTHING`,
      [randomUUID(), event.eventId, event.data.enquiryId, event.eventType, event.eventVersion, event.data.entity.type, event.correlationId ?? null],
    );
    const record = await this.findByEventId(event.eventId);
    if (!record) throw new Error(`Ledger record for ${event.eventId} not found after insert`);
    return record;
  }

  async findByEventId(eventId: string): Promise<DeliveryRecord | null> {
    const result = await this.pool.query<DeliveryRecord>(`SELECT ${COLUMNS} FROM notification_deliveries WHERE event_id = $1`, [eventId]);
    return result.rows[0] ?? null;
  }

  /**
   * Claims the right to send the email. Returns null if the email was already sent or another
   * worker holds an unexpired lease, preventing concurrent duplicate deliveries from both sending.
   */
  async claimEmailSend(eventId: string, leaseMs: number): Promise<DeliveryRecord | null> {
    const result = await this.pool.query<DeliveryRecord>(
      `UPDATE notification_deliveries
          SET email_lease_until = now() + ($2::int * interval '1 millisecond'),
              attempt_count = attempt_count + 1, last_email_attempt_at = now(), updated_at = now()
        WHERE event_id = $1 AND email_status <> 'SENT'
          AND (email_lease_until IS NULL OR email_lease_until < now())
        RETURNING ${COLUMNS}`,
      [eventId, leaseMs],
    );
    return result.rows[0] ?? null;
  }

  /** Records provider acceptance and the pending callback in one statement, before any callback attempt. */
  async recordEmailSent(eventId: string, providerMessageId: string): Promise<DeliveryRecord> {
    const result = await this.pool.query<DeliveryRecord>(
      `UPDATE notification_deliveries
          SET email_status = 'SENT', provider_message_id = $2, email_sent_at = now(), email_lease_until = NULL,
              last_email_error = NULL, callback_status = 'PENDING', next_callback_retry_at = now(), updated_at = now()
        WHERE event_id = $1
        RETURNING ${COLUMNS}`,
      [eventId, providerMessageId],
    );
    const record = result.rows[0];
    if (!record) throw new Error(`Ledger record for ${eventId} not found`);
    return record;
  }

  async recordEmailFailed(eventId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_deliveries
          SET email_status = 'FAILED', last_email_error = $2, email_lease_until = NULL, updated_at = now()
        WHERE event_id = $1 AND email_status <> 'SENT'`,
      [eventId, error.slice(0, 500)],
    );
  }

  /** Claims due pending callbacks with a lease so concurrent workers/instances never double-call. */
  async claimDueCallbacks(limit: number, leaseMs: number, eventId?: string): Promise<DeliveryRecord[]> {
    const result = await this.pool.query<DeliveryRecord>(
      `UPDATE notification_deliveries d
          SET next_callback_retry_at = now() + ($2::int * interval '1 millisecond'), updated_at = now()
        WHERE d.id IN (
          SELECT id FROM notification_deliveries
           WHERE callback_status = 'PENDING' AND next_callback_retry_at <= now()
             AND ($3::uuid IS NULL OR event_id = $3::uuid)
           ORDER BY next_callback_retry_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
        RETURNING ${COLUMNS.split(',').map((column) => `d.${column.trim()}`).join(', ')}`,
      [limit, leaseMs, eventId ?? null],
    );
    return result.rows;
  }

  async recordCallbackCompleted(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_deliveries
          SET callback_status = 'COMPLETED', callback_completed_at = now(), callback_attempt_count = callback_attempt_count + 1,
              last_callback_attempt_at = now(), next_callback_retry_at = NULL, last_callback_error = NULL, updated_at = now()
        WHERE event_id = $1 AND callback_status = 'PENDING'`,
      [eventId],
    );
  }

  async recordCallbackRetry(eventId: string, error: string, delayMs: number, countAttempt: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE notification_deliveries
          SET callback_attempt_count = callback_attempt_count + $4::int,
              last_callback_attempt_at = CASE WHEN $4::int = 1 THEN now() ELSE last_callback_attempt_at END,
              next_callback_retry_at = now() + ($3::int * interval '1 millisecond'),
              last_callback_error = $2, updated_at = now()
        WHERE event_id = $1 AND callback_status = 'PENDING'`,
      [eventId, error.slice(0, 500), delayMs, countAttempt ? 1 : 0],
    );
  }

  /** Terminal, monitored callback failure (non-retryable rejection or retries exhausted). */
  async recordCallbackFailed(eventId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_deliveries
          SET callback_status = 'FAILED', callback_attempt_count = callback_attempt_count + 1, last_callback_attempt_at = now(),
              next_callback_retry_at = NULL, last_callback_error = $2, updated_at = now()
        WHERE event_id = $1 AND callback_status = 'PENDING'`,
      [eventId, error.slice(0, 500)],
    );
  }
}
