import { randomUUID } from 'node:crypto';
import { catalogEnquirySubmittedV1Schema } from '@catalog/contracts';
import type { Logger } from '../logger.js';
import type { EventPublisher } from './eventPublisher.js';
import type { OutboxRepository } from './outboxRepository.js';

export interface OutboxPublisherOptions {
  pollIntervalMs: number;
  batchSize: number;
  leaseMs: number;
}

/** Exponential backoff with full jitter, capped. */
export function backoffWithJitter(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/**
 * Background publisher: claims committed unpublished outbox rows and sends them to SQS.
 * publication is recorded only after SQS accepts the message. A crash between send and
 * markPublished re-publishes the event later; consumers are idempotent by eventId.
 */
export class OutboxPublisher {
  private readonly publisherId = `catalog-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
    private readonly options: OutboxPublisherOptions,
  ) {}

  start(): void {
    this.stopped = false;
    const tick = (): void => {
      if (this.stopped) return;
      this.running = this.publishPending()
        .then(() => undefined)
        .catch((error: unknown) => this.logger.error({ err: error, errorCategory: 'DATABASE' }, 'outbox poll failed'))
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(tick, this.options.pollIntervalMs);
        });
    };
    tick();
  }

  /** Stops polling and waits for the in-flight batch, but never longer than timeoutMs. */
  async stop(timeoutMs = 10_000): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([this.running, new Promise<void>((resolve) => (timeout = setTimeout(resolve, timeoutMs)))]);
    if (timeout) clearTimeout(timeout);
  }

  /** Publishes one batch. Returns the number of events published successfully. */
  async publishPending(): Promise<number> {
    const claimed = await this.repository.claimBatch(this.publisherId, this.options.batchSize, this.options.leaseMs);
    let published = 0;
    for (const row of claimed) {
      const parsed = catalogEnquirySubmittedV1Schema.safeParse(row.payload);
      if (!parsed.success) {
        this.logger.error({ eventId: row.id, errorCategory: 'MESSAGING' }, 'outbox payload failed contract validation; not published');
        await this.repository.markFailed(row.id, this.publisherId, 'payload failed contract validation', 3_600_000);
        continue;
      }
      const event = parsed.data;
      try {
        await this.publisher.publish(event);
        await this.repository.markPublished(row.id, this.publisherId);
        published += 1;
        this.logger.info({ eventId: event.eventId, enquiryId: event.data.enquiryId, correlationId: event.correlationId }, 'outbox event published');
      } catch (error) {
        const delay = backoffWithJitter(row.publish_attempt_count, 1000, 60_000);
        this.logger.warn(
          { eventId: event.eventId, enquiryId: event.data.enquiryId, attempt: row.publish_attempt_count, retryInMs: delay, errorCategory: 'MESSAGING', err: error instanceof Error ? error.message : String(error) },
          'outbox publish failed; will retry',
        );
        await this.repository.markFailed(row.id, this.publisherId, error instanceof Error ? error.message : 'publish failed', delay);
      }
    }
    return published;
  }
}
