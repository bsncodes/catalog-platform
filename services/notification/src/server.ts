import { createServer } from 'node:http';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool } from './db/pool.js';
import { DeliveryRepository } from './db/deliveryRepository.js';
import { MailpitSmtpProvider } from './email/mailpitSmtpProvider.js';
import { AwsSesProvider } from './email/awsSesProvider.js';
import { SalesRecipientResolver, type EmailProvider } from './email/provider.js';
import { CircuitBreaker } from './callback/circuitBreaker.js';
import { HttpCatalogClient } from './callback/catalogClient.js';
import { CallbackService } from './callback/callbackService.js';
import { CallbackRetryWorker } from './callback/callbackRetryWorker.js';
import { NotificationProcessor } from './processing/notificationProcessor.js';
import { SqsConsumer } from './consumer/sqsConsumer.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const pool = createPool(config.DATABASE_URL, (error) => logger.error({ err: error.message, errorCategory: 'DATABASE' }, 'idle database connection error'));
const repository = new DeliveryRepository(pool);

const emailProvider: EmailProvider =
  config.EMAIL_PROVIDER === 'ses' ? new AwsSesProvider(new SESv2Client({ region: config.SES_REGION })) : new MailpitSmtpProvider({ host: config.SMTP_HOST, port: config.SMTP_PORT });
const recipients = new SalesRecipientResolver({ PRODUCT: config.SALES_RECIPIENT_PRODUCT, CATEGORY: config.SALES_RECIPIENT_CATEGORY });

const breaker = new CircuitBreaker({ failureThreshold: config.BREAKER_FAILURE_THRESHOLD, openDurationMs: config.BREAKER_OPEN_MS, halfOpenMaxProbes: config.BREAKER_HALF_OPEN_PROBES });
const catalogClient = new HttpCatalogClient({ baseUrl: config.CATALOG_INTERNAL_URL, token: config.INTERNAL_API_TOKEN, timeoutMs: config.CALLBACK_TIMEOUT_MS });
const claimLeaseMs = config.CALLBACK_TIMEOUT_MS * 3;
const callbacks = new CallbackService(repository, catalogClient, breaker, { retryBaseMs: config.CALLBACK_RETRY_BASE_MS, retryMaxMs: config.CALLBACK_RETRY_MAX_MS, maxAttempts: config.CALLBACK_MAX_ATTEMPTS, claimLeaseMs }, logger.child({ component: 'callback' }));
const worker = new CallbackRetryWorker(repository, callbacks, logger.child({ component: 'callback-worker' }), { pollIntervalMs: config.CALLBACK_POLL_INTERVAL_MS, batchSize: 10, claimLeaseMs });

const processor = new NotificationProcessor(repository, emailProvider, recipients, callbacks, logger.child({ component: 'processor' }), {
  emailFrom: config.EMAIL_FROM,
  // Lease outlives one processing attempt but expires before the next SQS redelivery.
  emailLeaseMs: Math.min(config.SQS_VISIBILITY_TIMEOUT_SECONDS * 1000, 60_000),
  emailRetryBaseSeconds: config.EMAIL_RETRY_BASE_SECONDS,
  maxReceiveCount: config.SQS_MAX_RECEIVE_COUNT,
});

const sqs = new SQSClient({
  region: config.SQS_REGION,
  // Long polls last up to SQS_WAIT_TIME_SECONDS; throwOnRequestTimeout makes the bound real (a warning otherwise).
  requestHandler: {
    connectionTimeout: 2000,
    requestTimeout: (config.SQS_WAIT_TIME_SECONDS + 10) * 1000,
    socketTimeout: (config.SQS_WAIT_TIME_SECONDS + 10) * 1000,
    throwOnRequestTimeout: true,
  },
  maxAttempts: 3,
  ...(config.SQS_ENDPOINT ? { endpoint: config.SQS_ENDPOINT, useQueueUrlAsEndpoint: false } : {}),
});
const consumer = new SqsConsumer(sqs, processor, logger.child({ component: 'consumer' }), {
  queueName: config.SQS_QUEUE_NAME,
  waitTimeSeconds: config.SQS_WAIT_TIME_SECONDS,
  visibilityTimeoutSeconds: config.SQS_VISIBILITY_TIMEOUT_SECONDS,
  concurrency: config.CONSUMER_CONCURRENCY,
});

// Private health endpoint for container orchestration only (never published or routed).
const health = createServer((req, res) => {
  if (req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
    return;
  }
  if (req.url === '/health/ready') {
    pool
      .query('SELECT 1')
      .then(() => res.writeHead(consumer.isRunning() ? 200 : 503, { 'content-type': 'application/json' }).end(consumer.isRunning() ? '{"status":"ready"}' : '{"status":"stopping"}'))
      .catch(() => res.writeHead(503, { 'content-type': 'application/json' }).end('{"status":"unavailable"}'));
    return;
  }
  res.writeHead(404).end();
});

async function waitForDependencies(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1 FROM notification_deliveries LIMIT 1');
      await consumer.resolveQueueUrl();
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
  health.listen(config.HEALTH_PORT);
  consumer.start();
  worker.start();
  logger.info({ emailProvider: config.EMAIL_PROVIDER, concurrency: config.CONSUMER_CONCURRENCY }, 'notification service started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down: finishing in-flight messages');
    await Promise.all([consumer.stop(), worker.stop()]);
    health.close();
    await pool.end();
    sqs.destroy();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'notification service failed to start');
  process.exit(1);
});
