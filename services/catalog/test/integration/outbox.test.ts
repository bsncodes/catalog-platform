import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CreateQueueCommand, DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type pg from 'pg';
import type { CatalogEnquirySubmittedV1 } from '@catalog/contracts';
import { CatalogService } from '../../src/products/catalogService.js';
import { EnquiryService } from '../../src/enquiries/enquiryService.js';
import { OutboxRepository } from '../../src/outbox/outboxRepository.js';
import { OutboxPublisher } from '../../src/outbox/outboxPublisher.js';
import { SqsEventPublisher, type EventPublisher } from '../../src/outbox/eventPublisher.js';
import { FEATURED, fixtureProvider, silentLogger } from '../helpers.js';
import { resetTables, setupTestDatabase } from './db.js';

let pool: pg.Pool;
let enquiries: EnquiryService;
const customer = { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' };
const options = { pollIntervalMs: 50, batchSize: 10, leaseMs: 30000 };

beforeAll(async () => {
  pool = await setupTestDatabase();
  enquiries = new EnquiryService(pool, new CatalogService(fixtureProvider(), FEATURED));
});
beforeEach(async () => resetTables(pool));
afterAll(async () => pool.end());

const unpublished = async () => (await pool.query('SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL')).rows[0].n as number;

describe('OutboxPublisher', () => {
  it('marks an event published only after the publisher accepts it', async () => {
    await enquiries.createEnquiry({ entity: { type: 'PRODUCT', id: '1' }, customer }, 'c1');
    const sent: CatalogEnquirySubmittedV1[] = [];
    const publisher = new OutboxPublisher(new OutboxRepository(pool), { publish: async (e) => void sent.push(e) }, silentLogger, options);
    expect(await publisher.publishPending()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(await unpublished()).toBe(0);
    expect(await publisher.publishPending()).toBe(0);
  });

  it('keeps the event unpublished with a recorded error and a backoff when SQS rejects it', async () => {
    await enquiries.createEnquiry({ entity: { type: 'PRODUCT', id: '1' }, customer }, 'c1');
    const failing: EventPublisher = { publish: async () => Promise.reject(new Error('sqs down')) };
    const publisher = new OutboxPublisher(new OutboxRepository(pool), failing, silentLogger, options);
    expect(await publisher.publishPending()).toBe(0);
    const row = (await pool.query('SELECT published_at, publish_attempt_count, last_publish_error, claim_expires_at > now() AS delayed FROM outbox_events')).rows[0];
    expect(row).toMatchObject({ published_at: null, publish_attempt_count: 1, last_publish_error: 'sqs down', delayed: true });
    // Not immediately re-claimable (backoff), so a second poll does nothing.
    expect(await publisher.publishPending()).toBe(0);
  });

  it('never lets two concurrent publishers claim the same event', async () => {
    for (let i = 0; i < 6; i += 1) await enquiries.createEnquiry({ entity: { type: 'PRODUCT', id: String(i + 1) }, customer }, `c${i}`);
    const repo = new OutboxRepository(pool);
    const [a, b] = await Promise.all([repo.claimBatch('p-a', 6, 30000), repo.claimBatch('p-b', 6, 30000)]);
    const ids = [...a, ...b].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6);
  });

  it('re-claims an event whose publisher crashed after its lease expired', async () => {
    await enquiries.createEnquiry({ entity: { type: 'PRODUCT', id: '1' }, customer }, 'c1');
    const repo = new OutboxRepository(pool);
    expect(await repo.claimBatch('crashed', 10, 1)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(await repo.claimBatch('recovering', 10, 30000)).toHaveLength(1);
  });

  it('publishes to the SQS-compatible queue (ElasticMQ) via AWS SDK v3', async () => {
    const sqs = new SQSClient({ region: 'eu-west-1', endpoint: process.env.TEST_SQS_ENDPOINT ?? 'http://127.0.0.1:59324', useQueueUrlAsEndpoint: false, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
    const queueName = `catalog-it-${Date.now()}`;
    const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    try {
      const created = await enquiries.createEnquiry({ entity: { type: 'PRODUCT', id: '1' }, customer }, 'corr-sqs');
      const publisher = new OutboxPublisher(new OutboxRepository(pool), new SqsEventPublisher(sqs, queueName), silentLogger, options);
      expect(await publisher.publishPending()).toBe(1);
      const received = await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 2, MessageAttributeNames: ['All'] }));
      const message = received.Messages?.[0];
      expect(JSON.parse(message?.Body ?? '{}')).toMatchObject({ eventId: created.eventId, data: { enquiryId: created.enquiryId } });
      expect(message?.MessageAttributes?.correlationId?.StringValue).toBe('corr-sqs');
    } finally {
      await sqs.send(new DeleteQueueCommand({ QueueUrl }));
      sqs.destroy();
    }
  });
});
