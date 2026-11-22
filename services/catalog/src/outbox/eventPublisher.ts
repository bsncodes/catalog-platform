import { GetQueueUrlCommand, SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { CatalogEnquirySubmittedV1 } from '@catalog/contracts';

/** Messaging abstraction used by the outbox publisher. */
export interface EventPublisher {
  publish(event: CatalogEnquirySubmittedV1): Promise<void>;
}

/** SQS implementation (AWS SDK v3). Works unchanged against ElasticMQ locally and Amazon SQS in AWS. */
export class SqsEventPublisher implements EventPublisher {
  private queueUrl: string | undefined;

  constructor(
    private readonly client: SQSClient,
    private readonly queueName: string,
  ) {}

  async resolveQueueUrl(): Promise<string> {
    if (!this.queueUrl) {
      const result = await this.client.send(new GetQueueUrlCommand({ QueueName: this.queueName }));
      if (!result.QueueUrl) throw new Error(`Queue ${this.queueName} not found`);
      this.queueUrl = result.QueueUrl;
    }
    return this.queueUrl;
  }

  async publish(event: CatalogEnquirySubmittedV1): Promise<void> {
    const queueUrl = await this.resolveQueueUrl();
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: event.eventType },
          eventVersion: { DataType: 'Number', StringValue: String(event.eventVersion) },
          ...(event.correlationId ? { correlationId: { DataType: 'String', StringValue: event.correlationId } } : {}),
        },
      }),
    );
  }
}
