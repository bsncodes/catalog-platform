import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type pg from 'pg';
import { CatalogService } from '../../src/products/catalogService.js';
import { EnquiryService } from '../../src/enquiries/enquiryService.js';
import { createInternalApp, createPublicApp } from '../../src/app.js';
import { FEATURED, fixtureProvider, silentLogger } from '../helpers.js';
import { resetTables, setupTestDatabase } from './db.js';

let pool: pg.Pool;
let enquiries: EnquiryService;

const TOKEN = 'integration-internal-token';
const customer = { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' };

beforeAll(async () => {
  pool = await setupTestDatabase();
  enquiries = new EnquiryService(pool, new CatalogService(fixtureProvider(), FEATURED));
});
beforeEach(async () => resetTables(pool));
afterAll(async () => pool.end());

const publicApp = () =>
  createPublicApp({ logger: silentLogger, catalog: new CatalogService(fixtureProvider(), FEATURED), enquiries, pool, enquiryRateLimitPerMinute: 100, trustProxyHops: 0 });
const internalApp = () => createInternalApp({ logger: silentLogger, enquiries, internalToken: TOKEN });

async function createEnquiry(type: 'PRODUCT' | 'CATEGORY' = 'PRODUCT', id = '1') {
  const res = await request(publicApp()).post('/api/catalog/enquiries').set('X-Correlation-ID', 'it-corr-1').send({ entity: { type, id }, customer, message: '<b>Hi</b>' });
  expect(res.status).toBe(202);
  const outbox = await pool.query<{ id: string; payload: { correlationId: string; data: { entity: { name: string } } } }>('SELECT id, payload FROM outbox_events WHERE aggregate_id = $1', [res.body.enquiryId]);
  return { enquiryId: res.body.enquiryId as string, eventId: outbox.rows[0]!.id, payload: outbox.rows[0]!.payload };
}

const callback = (enquiryId: string, eventId: string) =>
  request(internalApp())
    .patch(`/internal/catalog/enquiries/${enquiryId}/notification-status`)
    .set('Authorization', `Bearer ${TOKEN}`)
    .send({ eventId, notificationStatus: 'SENT', providerMessageId: 'mailpit-1', processedAt: new Date().toISOString() });

const statusOf = async (id: string) => (await pool.query<{ status: string }>('SELECT status FROM catalog_enquiries WHERE id = $1', [id])).rows[0]?.status;

describe('enquiry creation (transactional outbox)', () => {
  it('persists the enquiry as RECEIVED and one versioned outbox event in the same commit', async () => {
    const { enquiryId, payload } = await createEnquiry();
    expect(await statusOf(enquiryId)).toBe('RECEIVED');
    expect(payload).toMatchObject({ eventType: 'CATALOG_ENQUIRY_SUBMITTED', eventVersion: 1, correlationId: 'it-corr-1', data: { entity: { name: 'Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops' } } });
    const snapshot = await pool.query('SELECT entity_snapshot FROM catalog_enquiries WHERE id = $1', [enquiryId]);
    expect(snapshot.rows[0].entity_snapshot).toMatchObject({ type: 'PRODUCT', id: '1', category: "men's clothing" });
  });

  it('supports CATEGORY enquiries through the same model', async () => {
    const { enquiryId, payload } = await createEnquiry('CATEGORY', 'jewelery');
    expect(await statusOf(enquiryId)).toBe('RECEIVED');
    expect(payload.data.entity.name).toBe('jewelery');
  });

  it('rejects unknown entities with 422 and persists nothing', async () => {
    const res = await request(publicApp()).post('/api/catalog/enquiries').send({ entity: { type: 'PRODUCT', id: '999' }, customer });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ENTITY_NOT_FOUND');
    expect((await pool.query('SELECT count(*)::int AS n FROM catalog_enquiries')).rows[0].n).toBe(0);
  });

  it('rolls back the enquiry when the outbox insert fails (atomicity)', async () => {
    const service = new EnquiryService(pool, new CatalogService(fixtureProvider(), FEATURED));
    await pool.query('ALTER TABLE outbox_events ADD CONSTRAINT it_force_fail CHECK (event_version < 0) NOT VALID');
    try {
      await expect(service.createEnquiry({ entity: { type: 'PRODUCT', id: '1' }, customer }, 'c')).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
    } finally {
      await pool.query('ALTER TABLE outbox_events DROP CONSTRAINT it_force_fail');
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM catalog_enquiries')).rows[0].n).toBe(0);
  });
});

describe('internal notification-status callback', () => {
  it('transitions RECEIVED -> PROCESSED once, and repeats are DUPLICATE', async () => {
    const { enquiryId, eventId } = await createEnquiry();
    const first = await callback(enquiryId, eventId);
    expect(first.body).toEqual({ enquiryId, status: 'PROCESSED', callbackResult: 'APPLIED' });
    const second = await callback(enquiryId, eventId);
    expect(second.body).toEqual({ enquiryId, status: 'PROCESSED', callbackResult: 'DUPLICATE' });
    expect(await statusOf(enquiryId)).toBe('PROCESSED');
  });

  it('handles concurrent duplicate callbacks with exactly one APPLIED', async () => {
    const { enquiryId, eventId } = await createEnquiry();
    const results = await Promise.all([callback(enquiryId, eventId), callback(enquiryId, eventId), callback(enquiryId, eventId)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.callbackResult === 'APPLIED')).toHaveLength(1);
  });

  it('never regresses a RESOLVED enquiry', async () => {
    const { enquiryId, eventId } = await createEnquiry();
    await callback(enquiryId, eventId);
    await enquiries.resolveEnquiry(enquiryId, 'sales-user-1', 'Called back');
    const repeat = await callback(enquiryId, eventId);
    expect(repeat.body).toMatchObject({ status: 'RESOLVED', callbackResult: 'DUPLICATE' });
    expect(await statusOf(enquiryId)).toBe('RESOLVED');
  });

  it('returns STALE_IGNORED for a first-time callback arriving after resolution', async () => {
    const { enquiryId, eventId } = await createEnquiry();
    // Simulate an out-of-band resolution path reaching RESOLVED before the callback is recorded.
    await pool.query(`UPDATE catalog_enquiries SET status = 'RESOLVED', processed_at = now(), resolved_at = now() WHERE id = $1`, [enquiryId]);
    const res = await callback(enquiryId, eventId);
    expect(res.body).toEqual({ enquiryId, status: 'RESOLVED', callbackResult: 'STALE_IGNORED' });
    expect(await statusOf(enquiryId)).toBe('RESOLVED');
  });

  it('rejects an event id that belongs to a different enquiry with 409', async () => {
    const a = await createEnquiry();
    const b = await createEnquiry('PRODUCT', '2');
    const res = await callback(a.enquiryId, b.eventId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_ENQUIRY_MISMATCH');
    expect(await statusOf(a.enquiryId)).toBe('RECEIVED');
  });

  it('returns 404 for an unknown enquiry', async () => {
    const res = await callback(randomUUID(), randomUUID());
    expect(res.status).toBe(404);
  });

  it('keeps the enquiry RECEIVED when no successful callback arrives (e.g. email failure)', async () => {
    const { enquiryId } = await createEnquiry();
    expect(await statusOf(enquiryId)).toBe('RECEIVED');
  });
});

describe('GET /api/catalog/enquiries/:enquiryId (ASM-035)', () => {
  const statusOf = async (id: string) => request(publicApp()).get(`/api/catalog/enquiries/${id}`);

  it('reports RECEIVED -> PROCESSED -> RESOLVED with timestamps and no customer data', async () => {
    const { enquiryId, eventId } = await createEnquiry();
    const received = await statusOf(enquiryId);
    expect(received.status).toBe(200);
    expect(received.body.data).toMatchObject({ enquiryId, status: 'RECEIVED', entity: { type: 'PRODUCT', id: '1', name: 'Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops' }, processedAt: null, resolvedAt: null });
    expect(Date.parse(received.body.data.receivedAt)).not.toBeNaN();

    await callback(enquiryId, eventId);
    const processed = (await statusOf(enquiryId)).body.data;
    expect(processed.status).toBe('PROCESSED');
    expect(processed.processedAt).not.toBeNull();

    await enquiries.resolveEnquiry(enquiryId, 'sales-user-1');
    const resolved = (await statusOf(enquiryId)).body.data;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedAt).not.toBeNull();

    const body = JSON.stringify(resolved);
    for (const secret of ['jane@example.com', '+919876543210', 'Jane Doe', '<b>Hi</b>', 'sales-user-1']) expect(body).not.toContain(secret);
  });

  it('returns 404 ENQUIRY_NOT_FOUND for an unknown id', async () => {
    const res = await statusOf(randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ENQUIRY_NOT_FOUND');
  });
});

describe('resolution domain operation', () => {
  it('rejects RECEIVED -> RESOLVED (must be PROCESSED first)', async () => {
    const { enquiryId } = await createEnquiry();
    await expect(enquiries.resolveEnquiry(enquiryId, 'sales')).rejects.toThrow(/cannot transition from RECEIVED to RESOLVED/);
  });
});
