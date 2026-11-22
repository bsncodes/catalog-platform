import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type pg from 'pg';
import { SqsConsumer } from '../../src/consumer/sqsConsumer.js';
import { resetTables, setupTestDatabase } from './db.js';
import { build, FakeEmailProvider, ledger, makeEvent, silent } from './harness.js';

let pool: pg.Pool;
const sqs = new SQSClient({ region: 'eu-west-1', endpoint: process.env.TEST_SQS_ENDPOINT ?? 'http://127.0.0.1:59324', useQueueUrlAsEndpoint: false, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const suffix = Date.now();
const queueName = `notif-it-${suffix}`;
const dlqName = `notif-it-${suffix}-dlq`;
let queueUrl = '';
let dlqUrl = '';

beforeAll(async () => {
  pool = await setupTestDatabase();
  dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: dlqName }))).QueueUrl ?? '';
  const dlqArn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }))).Attributes?.QueueArn ?? '';
  queueUrl =
    (await sqs.send(new CreateQueueCommand({ QueueName: queueName, Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: '2' }) } }))).QueueUrl ?? '';
});
beforeEach(async () => resetTables(pool));
afterAll(async () => {
  await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl: dlqUrl }));
  sqs.destroy();
  await pool.end();
});

const depth = async (url: string) => Number((await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'] }))).Attributes?.ApproximateNumberOfMessages ?? '0');

describe('SqsConsumer (ElasticMQ, AWS SDK v3)', () => {
  it('deletes the message only after successful, durably recorded processing', async () => {
    const { processor, email } = build(pool);
    const consumer = new SqsConsumer(sqs, processor, silent, { queueName, waitTimeSeconds: 1, visibilityTimeoutSeconds: 1, concurrency: 5 });
    const event = makeEvent();
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(event), MessageAttributes: { correlationId: { DataType: 'String', StringValue: 'c-1' } } }));
    expect(await consumer.pollOnce()).toBe(1);
    expect(email.sent).toHaveLength(1);
    expect((await ledger(pool, event.eventId)).email_status).toBe('SENT');
    await new Promise((r) => setTimeout(r, 1200));
    expect(await depth(queueUrl)).toBe(0);
  });

  it('does not ack when email fails; after maxReceiveCount the message is redriven to the DLQ', async () => {
    const email = new FakeEmailProvider();
    email.failNext = 100;
    const { processor } = build(pool, { email });
    // Make failed messages visible again immediately to keep the test fast.
    const immediateRetry = {
      handle: async (m: Parameters<typeof processor.handle>[0]) => {
        const result = await processor.handle(m);
        return result.ack ? result : { ...result, retryDelaySeconds: 0 };
      },
    };
    const consumer = new SqsConsumer(sqs, immediateRetry, silent, { queueName, waitTimeSeconds: 1, visibilityTimeoutSeconds: 1, concurrency: 1 });
    const event = makeEvent();
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(event) }));
    await consumer.pollOnce(); // receive 1 -> fail
    await consumer.pollOnce(); // receive 2 -> fail
    await consumer.pollOnce(); // exceeds maxReceiveCount -> moved to DLQ
    const dead = await sqs.send(new ReceiveMessageCommand({ QueueUrl: dlqUrl, WaitTimeSeconds: 2 }));
    expect(JSON.parse(dead.Messages?.[0]?.Body ?? '{}').eventId).toBe(event.eventId);
    expect(await ledger(pool, event.eventId)).toMatchObject({ email_status: 'FAILED', callback_status: null, attempt_count: 2 });
  });
});
