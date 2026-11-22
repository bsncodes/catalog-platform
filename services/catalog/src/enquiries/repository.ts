import type { CatalogEnquirySubmittedV1, EnquiryEntityType, EnquiryStatus } from '@catalog/contracts';
import type { PoolClient } from '../db/pool.js';

export interface EntitySnapshot {
  type: EnquiryEntityType;
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface NewEnquiry {
  id: string;
  entity: EntitySnapshot;
  customer: { name: string; email: string; phone: string };
  message?: string;
  receivedAt: Date;
}

export interface EnquiryRow {
  id: string;
  status: EnquiryStatus;
  processed_at: Date | null;
  resolved_at: Date | null;
}

export interface EnquiryStatusRow {
  id: string;
  status: EnquiryStatus;
  entity_type: EnquiryEntityType;
  entity_id: string;
  entity_name: string;
  received_at: Date;
  processed_at: Date | null;
  resolved_at: Date | null;
}

/** Data access for Catalog-owned enquiry tables. All SQL is parameterized. */
export const enquiryRepository = {
  /** Lifecycle fields only; customer contact details are deliberately not selected. */
  async findStatus(db: Pick<PoolClient, 'query'>, id: string): Promise<EnquiryStatusRow | null> {
    const result = await db.query<EnquiryStatusRow>(
      `SELECT id, status, entity_type, entity_id, entity_snapshot->>'name' AS entity_name, received_at, processed_at, resolved_at
         FROM catalog_enquiries WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async insertEnquiry(client: PoolClient, enquiry: NewEnquiry): Promise<void> {
    await client.query(
      `INSERT INTO catalog_enquiries
         (id, entity_type, entity_id, entity_snapshot, customer_name, customer_email, customer_phone, message, status, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECEIVED', $9)`,
      [
        enquiry.id,
        enquiry.entity.type,
        enquiry.entity.id,
        JSON.stringify(enquiry.entity),
        enquiry.customer.name,
        enquiry.customer.email,
        enquiry.customer.phone,
        enquiry.message ?? null,
        enquiry.receivedAt,
      ],
    );
  },

  async insertOutboxEvent(client: PoolClient, event: CatalogEnquirySubmittedV1): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, created_at)
       VALUES ($1, 'ENQUIRY', $2, $3, $4, $5, $6)`,
      [event.eventId, event.data.enquiryId, event.eventType, event.eventVersion, JSON.stringify(event), event.occurredAt],
    );
  },

  async lockEnquiry(client: PoolClient, id: string): Promise<EnquiryRow | null> {
    const result = await client.query<EnquiryRow>(
      'SELECT id, status, processed_at, resolved_at FROM catalog_enquiries WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  },

  async findEventAggregate(client: PoolClient, eventId: string): Promise<string | null> {
    const result = await client.query<{ aggregate_id: string }>('SELECT aggregate_id FROM outbox_events WHERE id = $1', [eventId]);
    return result.rows[0]?.aggregate_id ?? null;
  },

  async findProcessedEvent(client: PoolClient, eventId: string): Promise<{ enquiry_id: string } | null> {
    const result = await client.query<{ enquiry_id: string }>('SELECT enquiry_id FROM processed_events WHERE event_id = $1', [eventId]);
    return result.rows[0] ?? null;
  },

  async recordProcessedEvent(client: PoolClient, eventId: string, enquiryId: string, result: 'APPLIED' | 'STALE_IGNORED'): Promise<void> {
    await client.query('INSERT INTO processed_events (event_id, enquiry_id, callback_result) VALUES ($1, $2, $3)', [eventId, enquiryId, result]);
  },

  async markProcessed(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE catalog_enquiries SET status = 'PROCESSED', processed_at = now(), updated_at = now() WHERE id = $1 AND status = 'RECEIVED'`,
      [id],
    );
  },

  async markResolved(client: PoolClient, id: string, resolvedBy: string, notes: string | null): Promise<void> {
    await client.query(
      `UPDATE catalog_enquiries
         SET status = 'RESOLVED', resolved_at = now(), resolved_by = $2, resolution_notes = $3, updated_at = now()
       WHERE id = $1 AND status = 'PROCESSED'`,
      [id, resolvedBy, notes],
    );
  },
};
