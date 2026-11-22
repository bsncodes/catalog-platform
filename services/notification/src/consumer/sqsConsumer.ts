import { ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, type Message, type SQSClient } from '@aws-sdk/client-sqs';
import type { Logger } from '../logger.js';
import type { IncomingMessage, ProcessingResult } from '../processing/notificationProcessor.js';

export interface MessageHandler {
  handle(message: IncomingMessage): Promise<ProcessingResult>;
}

export interface SqsConsumerOptions {
  queueName: string;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds: number;
  concurrency: number;
}

/**
 * Long-polling SQS consumer (AWS SDK v3). Each receive fetches at most `concurrency` messages,
 * which bounds in-flight work. Messages are deleted only after the handler reports ack.
 */
export class SqsConsumer {
  private queueUrl: string | undefined;
  private stopped = true;
  private loop: Promise<void> | undefined;
  private abort = new AbortController();

  constructor(
    private readonly client: SQSClient,
    private readonly handler: MessageHandler,
    private readonly logger: Logger,
    private readonly options: SqsConsumerOptions,
  ) {}

  async resolveQueueUrl(): Promise<string> {
    if (!this.queueUrl) {
      const result = await this.client.send(new GetQueueUrlCommand({ QueueName: this.options.queueName }));
      if (!result.QueueUrl) throw new Error(`Queue ${this.options.queueName} not found`);
      this.queueUrl = result.QueueUrl;
    }
    return this.queueUrl;
  }

  start(): void {
    this.stopped = false;
    this.abort = new AbortController();
    this.loop = this.run();
  }

  /** Stops receiving and waits for in-flight messages to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.abort.abort();
    await this.loop;
  }

  isRunning(): boolean {
    return !this.stopped;
  }

  /** Receives and processes one batch. Exposed for tests. */
  async pollOnce(): Promise<number> {
    const queueUrl = await this.resolveQueueUrl();
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: this.options.concurrency,
        WaitTimeSeconds: this.options.waitTimeSeconds,
        VisibilityTimeout: this.options.visibilityTimeoutSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        MessageAttributeNames: ['All'],
      }),
      { abortSignal: this.abort.signal },
    );
    const messages = response.Messages ?? [];
    // allSettled: one message's failure must never abandon the others mid-flight (RV3-02).
    await Promise.allSettled(messages.map((message) => this.processMessage(queueUrl, message)));
    return messages.length;
  }

  private async run(): Promise<void> {
    let failures = 0;
    while (!this.stopped) {
      try {
        await this.pollOnce();
        failures = 0;
      } catch (error) {
        if (this.stopped) break;
        failures += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
        this.logger.error({ err: error instanceof Error ? error.message : String(error), errorCategory: 'MESSAGING', retryInMs: delay }, 'SQS receive failed');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async processMessage(queueUrl: string, message: Message): Promise<void> {
    if (!message.ReceiptHandle || message.Body === undefined) return;
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');
    const correlationId = message.MessageAttributes?.correlationId?.StringValue;
    let result: ProcessingResult;
    try {
      result = await this.handler.handle({ body: message.Body, receiveCount, ...(correlationId ? { correlationId } : {}) });
    } catch (error) {
      // e.g. database unavailable: nothing durable recorded, so do not ack; SQS redelivers after the visibility timeout.
      this.logger.error({ messageId: message.MessageId, receiveCount, err: error instanceof Error ? error.message : String(error), errorCategory: 'NOTIFICATION' }, 'message processing failed; not acknowledged');
      return;
    }
    if (result.ack) {
      try {
        await this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
      } catch (error) {
        // Safe: the outcome is durable, so redelivery takes the idempotent DUPLICATE path.
        this.logger.warn({ messageId: message.MessageId, outcome: result.outcome, err: error instanceof Error ? error.message : String(error), errorCategory: 'MESSAGING' }, 'delete failed; message will be redelivered and handled idempotently');
      }
      return;
    }
    if (result.retryDelaySeconds !== undefined) {
      const delay = Math.min(43_200, Math.max(0, result.retryDelaySeconds));
      await this.client
        .send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: delay }))
        .catch((error: unknown) => this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'could not set retry visibility'));
    }
  }
}
