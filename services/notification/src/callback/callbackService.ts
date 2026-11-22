import type { Logger } from '../logger.js';
import { backoffWithJitter } from '../backoff.js';
import type { DeliveryRecord, DeliveryRepository } from '../db/deliveryRepository.js';
import { CatalogCallbackError, type CatalogClient } from './catalogClient.js';
import { CircuitOpenError, type CircuitBreaker } from './circuitBreaker.js';

export interface CallbackPolicy {
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  claimLeaseMs: number;
}

export type CallbackAttemptOutcome = 'COMPLETED' | 'RETRY_SCHEDULED' | 'FAILED';

/**
 * Reports a durably-recorded successful email to Catalog Service. Never sends email.
 * Every outcome is persisted so callback progress survives restarts.
 */
export class CallbackService {
  constructor(
    private readonly repository: DeliveryRepository,
    private readonly client: CatalogClient,
    private readonly breaker: CircuitBreaker,
    private readonly policy: CallbackPolicy,
    private readonly logger: Logger,
  ) {}

  /** Claims and attempts the callback for one event if it is due (used right after email success). */
  async attemptForEvent(eventId: string): Promise<CallbackAttemptOutcome | 'NOT_DUE'> {
    const [record] = await this.repository.claimDueCallbacks(1, this.policy.claimLeaseMs, eventId);
    return record ? this.attempt(record) : 'NOT_DUE';
  }

  async attempt(record: DeliveryRecord): Promise<CallbackAttemptOutcome> {
    const log = this.logger.child({ eventId: record.event_id, enquiryId: record.enquiry_id, correlationId: record.correlation_id ?? undefined });
    if (!record.provider_message_id || !record.email_sent_at) {
      await this.repository.recordCallbackFailed(record.event_id, 'ledger record has no successful email to report');
      log.error({ errorCategory: 'NOTIFICATION' }, 'callback pending without a sent email; marked FAILED');
      return 'FAILED';
    }

    const attemptNumber = record.callback_attempt_count + 1;
    try {
      const response = await this.breaker.execute(
        () =>
          this.client.reportNotificationSent(
            record.enquiry_id,
            {
              eventId: record.event_id,
              notificationStatus: 'SENT',
              providerMessageId: record.provider_message_id ?? '',
              processedAt: new Date(record.email_sent_at ?? Date.now()).toISOString(),
            },
            record.correlation_id ?? undefined,
          ),
        (error) => error instanceof CatalogCallbackError && error.healthFailure,
      );
      await this.repository.recordCallbackCompleted(record.event_id);
      log.info({ callbackResult: response.callbackResult, enquiryStatus: response.status, attempt: attemptNumber }, 'catalog callback completed');
      return 'COMPLETED';
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Fail fast without calling Catalog; not counted as an attempt.
        const delay = Math.max(error.retryAfterMs, this.policy.retryBaseMs);
        await this.repository.recordCallbackRetry(record.event_id, 'circuit open', delay, false);
        log.warn({ retryInMs: delay, errorCategory: 'INTERNAL_COMMUNICATION' }, 'circuit open; catalog callback deferred');
        return 'RETRY_SCHEDULED';
      }
      const message = error instanceof Error ? error.message : String(error);
      const retryable = !(error instanceof CatalogCallbackError) || error.retryable;
      if (!retryable || attemptNumber >= this.policy.maxAttempts) {
        await this.repository.recordCallbackFailed(record.event_id, message);
        // Terminal, monitored state: alert on this log / on callback_status = 'FAILED'.
        log.error({ attempt: attemptNumber, errorCategory: 'INTERNAL_COMMUNICATION', err: message }, 'catalog callback failed terminally');
        return 'FAILED';
      }
      const delay = backoffWithJitter(attemptNumber, this.policy.retryBaseMs, this.policy.retryMaxMs);
      await this.repository.recordCallbackRetry(record.event_id, message, delay, true);
      log.warn({ attempt: attemptNumber, retryInMs: delay, errorCategory: 'INTERNAL_COMMUNICATION', err: message }, 'catalog callback failed; retry scheduled');
      return 'RETRY_SCHEDULED';
    }
  }
}
