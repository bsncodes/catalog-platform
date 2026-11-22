import { SQSClient } from '@aws-sdk/client-sqs';

export interface SqsClientOptions {
  region: string;
  endpoint?: string;
  requestTimeoutMs: number;
  /** Only for tests; in AWS the default chain resolves the ECS task role. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/**
 * SQS client with enforced timeouts. `throwOnRequestTimeout` is required: without it the
 * Smithy handler only logs a warning and a hung request never fails (RV2-06).
 */
export function createSqsClient(options: SqsClientOptions): SQSClient {
  return new SQSClient({
    region: options.region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: options.requestTimeoutMs,
      throwOnRequestTimeout: true,
      socketTimeout: options.requestTimeoutMs,
    },
    maxAttempts: 3,
    ...(options.credentials ? { credentials: options.credentials } : {}),
    // With a custom endpoint (ElasticMQ locally) route calls there rather than to the queue URL host.
    ...(options.endpoint ? { endpoint: options.endpoint, useQueueUrlAsEndpoint: false } : {}),
  });
}
