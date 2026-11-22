import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool } from './db/pool.js';
import { CatalogService } from './products/catalogService.js';
import { FakeStoreProvider } from './products/fakeStoreProvider.js';
import { FixtureProductProvider } from './products/fixtureProvider.js';
import type { ProductProvider } from './products/provider.js';
import { EnquiryService } from './enquiries/enquiryService.js';
import { OutboxRepository } from './outbox/outboxRepository.js';
import { OutboxPublisher } from './outbox/outboxPublisher.js';
import { SqsEventPublisher } from './outbox/eventPublisher.js';
import { createSqsClient } from './outbox/sqsClient.js';
import { createInternalApp, createPublicApp } from './app.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const provider: ProductProvider =
  config.PRODUCT_PROVIDER === 'fixture'
    ? FixtureProductProvider.fromFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'products.json'), config.PRODUCT_CURRENCY)
    : new FakeStoreProvider({ baseUrl: config.FAKESTORE_BASE_URL, timeoutMs: config.PROVIDER_TIMEOUT_MS, currency: config.PRODUCT_CURRENCY });

const pool = createPool(config.DATABASE_URL, (error) => logger.error({ err: error.message, errorCategory: 'DATABASE' }, 'idle database connection error'));
const catalog = new CatalogService(provider, config.FEATURED_PRODUCT_IDS);
const enquiries = new EnquiryService(pool, catalog);

const sqs = createSqsClient({ region: config.SQS_REGION, requestTimeoutMs: config.SQS_REQUEST_TIMEOUT_MS, ...(config.SQS_ENDPOINT ? { endpoint: config.SQS_ENDPOINT } : {}) });
const sqsPublisher = new SqsEventPublisher(sqs, config.SQS_QUEUE_NAME);
const outbox = new OutboxPublisher(new OutboxRepository(pool), sqsPublisher, logger.child({ component: 'outbox' }), {
  pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
  batchSize: config.OUTBOX_BATCH_SIZE,
  leaseMs: config.OUTBOX_CLAIM_LEASE_MS,
});

async function waitForDependencies(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1 FROM catalog_enquiries LIMIT 1');
      await sqsPublisher.resolveQueueUrl();
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      logger.warn({ attempt, err: error instanceof Error ? error.message : String(error) }, 'dependencies not ready; retrying');
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 500 * attempt)));
    }
  }
}

async function main(): Promise<void> {
  await waitForDependencies();
  const publicServer = createPublicApp({ logger, catalog, enquiries, pool, enquiryRateLimitPerMinute: config.ENQUIRY_RATE_LIMIT_PER_MINUTE, trustProxyHops: config.TRUST_PROXY_HOPS }).listen(config.PUBLIC_PORT);
  const internalServer = createInternalApp({ logger, enquiries, internalToken: config.INTERNAL_API_TOKEN }).listen(config.INTERNAL_PORT);
  outbox.start();
  logger.info({ publicPort: config.PUBLIC_PORT, internalPort: config.INTERNAL_PORT, provider: config.PRODUCT_PROVIDER }, 'catalog service started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await Promise.all([closeServer(publicServer), closeServer(internalServer), outbox.stop()]);
    await pool.end();
    sqs.destroy();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'catalog service failed to start');
  process.exit(1);
});
