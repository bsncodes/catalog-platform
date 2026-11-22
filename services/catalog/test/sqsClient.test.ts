import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSqsClient } from '../src/outbox/sqsClient.js';
import { SqsEventPublisher } from '../src/outbox/eventPublisher.js';

// A TCP server that accepts connections and never responds, simulating a hung SQS endpoint.
let server: Server;
let port = 0;
const sockets = new Set<Socket>();
beforeAll(async () => {
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createSqsClient (RV2-06)', () => {
  it('fails a hung SQS request instead of waiting forever', async () => {
    const client = createSqsClient({ region: 'eu-west-1', endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 300, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
    const publisher = new SqsEventPublisher(client, 'any-queue');
    const started = Date.now();
    const error = await publisher.resolveQueueUrl().catch((e: unknown) => e);
    client.destroy();
    expect(error).toMatchObject({ name: 'TimeoutError' });
    expect(sockets.size).toBeGreaterThan(0); // the request really reached the hung endpoint
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15000);
});
