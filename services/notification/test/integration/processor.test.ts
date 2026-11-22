import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { CallbackRetryWorker } from '../../src/callback/callbackRetryWorker.js';
import { CircuitBreaker } from '../../src/callback/circuitBreaker.js';
import { resetTables, setupTestDatabase } from './db.js';
import { build, FakeCatalog, FakeEmailProvider, HangingEmailProvider, ledger, makeEvent, silent } from './harness.js';

let pool: pg.Pool;
beforeAll(async () => {
  pool = await setupTestDatabase();
});
beforeEach(async () => resetTables(pool));
afterAll(async () => pool.end());

const msg = (body: unknown, receiveCount = 1) => ({ body: typeof body === 'string' ? body : JSON.stringify(body), receiveCount });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('NotificationProcessor', () => {
  it('sends one email to the configured recipient, records SENT, completes the callback and acks', async () => {
    const { processor, email, catalog } = build(pool);
    const event = makeEvent();
    expect(await processor.handle(msg(event))).toEqual({ ack: true, outcome: 'SENT' });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: 'products@sales.test', from: 'catalog@notifications.test', replyTo: 'jane@example.com' });
    expect(catalog.calls).toEqual([{ enquiryId: event.data.enquiryId, payload: expect.objectContaining({ eventId: event.eventId, notificationStatus: 'SENT', providerMessageId: 'msg-1' }) }]);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'SENT', callback_status: 'COMPLETED', provider_message_id: 'msg-1', attempt_count: 1, callback_attempt_count: 1 });
  });

  it('routes CATEGORY enquiries to the category sales inbox', async () => {
    const { processor, email } = build(pool);
    await processor.handle(msg(makeEvent('CATEGORY')));
    expect(email.sent[0]?.to).toBe('categories@sales.test');
  });

  it('is idempotent: a duplicate delivery does not send a second email', async () => {
    const { processor, email, catalog } = build(pool);
    const event = makeEvent();
    await processor.handle(msg(event));
    expect(await processor.handle(msg(event, 2))).toEqual({ ack: true, outcome: 'DUPLICATE' });
    expect(email.sent).toHaveLength(1);
    expect(catalog.calls).toHaveLength(1);
  });

  it('sends exactly one email when the same event is delivered concurrently', async () => {
    const { processor, email } = build(pool);
    const event = makeEvent();
    const results = await Promise.all([processor.handle(msg(event)), processor.handle(msg(event)), processor.handle(msg(event))]);
    expect(email.sent).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'SENT')).toHaveLength(1);
  });

  it('email failure: records FAILED, does not call Catalog (enquiry stays RECEIVED) and does not ack', async () => {
    const email = new FakeEmailProvider();
    email.failNext = 1;
    const { processor, catalog } = build(pool, { email });
    const event = makeEvent();
    const result = await processor.handle(msg(event));
    expect(result).toMatchObject({ ack: false, outcome: 'EMAIL_FAILED', retryDelaySeconds: expect.any(Number) });
    expect(catalog.calls).toHaveLength(0);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'FAILED', callback_status: null, last_email_error: 'SMTP 421 service not available' });
    // Redelivery succeeds and the record moves to SENT.
    expect(await processor.handle(msg(event, 2))).toEqual({ ack: true, outcome: 'SENT' });
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'SENT', attempt_count: 2 });
  });

  it('email retries exhausted: leaves the message for SQS redrive to the DLQ and never calls Catalog', async () => {
    const email = new FakeEmailProvider();
    email.failNext = 10;
    const { processor, catalog } = build(pool, { email });
    const event = makeEvent();
    const result = await processor.handle(msg(event, 5));
    expect(result).toEqual({ ack: false, outcome: 'EMAIL_FAILED' });
    expect(catalog.calls).toHaveLength(0);
    expect((await ledger(pool, event.eventId)).email_status).toBe('FAILED');
  });

  it('a provider send that never settles ends as EMAIL_FAILED within the send timeout (RV3-01)', async () => {
    const { processor, catalog } = build(pool, { email: new HangingEmailProvider(), emailSendTimeoutMs: 200 });
    const event = makeEvent();
    const started = Date.now();
    const result = await processor.handle(msg(event));
    expect(result).toMatchObject({ ack: false, outcome: 'EMAIL_FAILED' });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(catalog.calls).toHaveLength(0);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'FAILED', last_email_error: 'Email provider did not respond within 200ms' });
  });

  it('rejects an invalid event without acking (it will reach the DLQ)', async () => {
    const { processor, email } = build(pool);
    expect(await processor.handle(msg('not json'))).toEqual({ ack: false, outcome: 'INVALID_EVENT' });
    expect(await processor.handle(msg({ ...makeEvent(), eventVersion: 2 }))).toEqual({ ack: false, outcome: 'INVALID_EVENT' });
    expect(email.sent).toHaveLength(0);
  });
});

describe('callback failure and durable recovery', () => {
  it('callback failure after email success: acks the message, keeps SENT, schedules a callback retry', async () => {
    const catalog = new FakeCatalog();
    catalog.mode = 'down';
    const { processor, email } = build(pool, { catalog });
    const event = makeEvent();
    expect(await processor.handle(msg(event))).toEqual({ ack: true, outcome: 'SENT' });
    expect(email.sent).toHaveLength(1);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'SENT', callback_status: 'PENDING', callback_attempt_count: 1, last_callback_error: 'Catalog callback failed with HTTP 503' });
  });

  it('retries only the callback after a restart (new instances), without resending the email', async () => {
    const downCatalog = new FakeCatalog();
    downCatalog.mode = 'down';
    const first = build(pool, { catalog: downCatalog });
    const event = makeEvent();
    await first.processor.handle(msg(event));

    // "Restart": brand-new service objects sharing only the durable ledger.
    const email = new FakeEmailProvider();
    const catalog = new FakeCatalog();
    const restarted = build(pool, { email, catalog });
    const worker = new CallbackRetryWorker(restarted.repository, restarted.callbacks, silent, { pollIntervalMs: 10, batchSize: 10, claimLeaseMs: 5000 });
    await wait(10);
    expect(await worker.runOnce()).toBe(1);
    expect(catalog.calls).toHaveLength(1);
    expect(email.sent).toHaveLength(0);
    expect(first.email.sent).toHaveLength(1);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'SENT', callback_status: 'COMPLETED', callback_attempt_count: 2 });
    // Nothing left to do; redelivery of the original message is a no-op.
    expect(await worker.runOnce()).toBe(0);
    expect(await restarted.processor.handle(msg(event, 2))).toEqual({ ack: true, outcome: 'DUPLICATE' });
    expect(email.sent).toHaveLength(0);
  });

  it('circuit OPEN: fails fast without calling Catalog and keeps the callback PENDING', async () => {
    const catalog = new FakeCatalog();
    catalog.mode = 'down';
    const breaker = new CircuitBreaker({ failureThreshold: 1, openDurationMs: 60000, halfOpenMaxProbes: 1 });
    const { processor } = build(pool, { catalog, breaker });
    const a = makeEvent();
    const b = makeEvent();
    await processor.handle(msg(a)); // trips the breaker
    expect(breaker.getState()).toBe('OPEN');
    await processor.handle(msg(b));
    expect(catalog.calls.map((c) => c.payload.eventId)).toEqual([a.eventId]);
    expect(await ledger(pool, b.eventId)).toMatchObject({ email_status: 'SENT', callback_status: 'PENDING', callback_attempt_count: 0, last_callback_error: 'circuit open' });
  });

  it('non-retryable rejection (404) moves the callback to the monitored FAILED state', async () => {
    const catalog = new FakeCatalog();
    catalog.mode = 'not-found';
    const { processor } = build(pool, { catalog });
    const event = makeEvent();
    await processor.handle(msg(event));
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'SENT', callback_status: 'FAILED' });
  });

  it('stops retrying after the configured maximum attempts', async () => {
    const catalog = new FakeCatalog();
    catalog.mode = 'down';
    const { processor, repository, callbacks } = build(pool, { catalog, maxAttempts: 2 });
    const event = makeEvent();
    await processor.handle(msg(event));
    const worker = new CallbackRetryWorker(repository, callbacks, silent, { pollIntervalMs: 10, batchSize: 10, claimLeaseMs: 5000 });
    await wait(10);
    await worker.runOnce();
    expect(await ledger(pool, event.eventId)).toMatchObject({ callback_status: 'FAILED', callback_attempt_count: 2 });
  });
});
