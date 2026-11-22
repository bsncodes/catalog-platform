import { catalogEnquirySubmittedV1Schema, type CatalogEnquirySubmittedV1 } from '@catalog/contracts';
import type { Logger } from '../logger.js';
import { backoffWithJitter } from '../backoff.js';
import type { DeliveryRepository } from '../db/deliveryRepository.js';
import type { EmailProvider, SalesRecipientResolver } from '../email/provider.js';
import { renderEnquiryEmail } from '../templates/index.js';
import type { CallbackService } from '../callback/callbackService.js';

export interface IncomingMessage {
  body: string;
  receiveCount: number;
  correlationId?: string;
}

/** ack=true: delete from SQS. ack=false: leave it; SQS redelivers (optionally after retryDelaySeconds) and redrives to the DLQ. */
export type ProcessingResult = { ack: true; outcome: string } | { ack: false; outcome: string; retryDelaySeconds?: number };

export interface ProcessorOptions {
  emailFrom: string;
  emailLeaseMs: number;
  emailRetryBaseSeconds: number;
  maxReceiveCount: number;
}

/**
 * Handles one CATALOG_ENQUIRY_SUBMITTED message: validate -> idempotency check -> render ->
 * send -> persist SENT + pending callback -> attempt callback -> ack.
 */
export class NotificationProcessor {
  constructor(
    private readonly repository: DeliveryRepository,
    private readonly emailProvider: EmailProvider,
    private readonly recipients: SalesRecipientResolver,
    private readonly callbacks: CallbackService,
    private readonly logger: Logger,
    private readonly options: ProcessorOptions,
  ) {}

  async handle(message: IncomingMessage): Promise<ProcessingResult> {
    const event = this.parse(message);
    if (!event) {
      // A contract violation can never succeed; leave it to SQS redrive so it lands in the DLQ for inspection.
      return { ack: false, outcome: 'INVALID_EVENT' };
    }
    const log = this.logger.child({ eventId: event.eventId, enquiryId: event.data.enquiryId, correlationId: event.correlationId ?? message.correlationId });

    const record = await this.repository.ensureRecord(event);
    if (record.email_status === 'SENT') {
      // Duplicate delivery (e.g. outbox re-publish). Email is never resent; callback progress is owned by the ledger/worker.
      log.info({ callbackStatus: record.callback_status }, 'duplicate event; email already sent');
      return { ack: true, outcome: 'DUPLICATE' };
    }

    const claimed = await this.repository.claimEmailSend(event.eventId, this.options.emailLeaseMs);
    if (!claimed) {
      log.info('email send in progress elsewhere; leaving message for redelivery');
      return { ack: false, outcome: 'IN_PROGRESS', retryDelaySeconds: Math.ceil(this.options.emailLeaseMs / 1000) };
    }

    const started = Date.now();
    let providerMessageId: string;
    try {
      const rendered = renderEnquiryEmail(event);
      const result = await this.emailProvider.send({
        ...rendered,
        to: this.recipients.resolve(event.data.entity.type),
        from: this.options.emailFrom,
        replyTo: event.data.customer.email,
      });
      providerMessageId = result.providerMessageId;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.repository.recordEmailFailed(event.eventId, reason);
      const exhausted = message.receiveCount >= this.options.maxReceiveCount;
      const retryDelaySeconds = Math.ceil(backoffWithJitter(message.receiveCount, this.options.emailRetryBaseSeconds * 1000, 300_000) / 1000);
      log.error(
        { attempt: claimed.attempt_count, receiveCount: message.receiveCount, errorCategory: 'NOTIFICATION', err: reason, ...(exhausted ? {} : { retryInSeconds: retryDelaySeconds }) },
        exhausted ? 'email delivery failed; retries exhausted, message will move to the DLQ' : 'email delivery failed; will retry',
      );
      return { ack: false, outcome: 'EMAIL_FAILED', ...(exhausted ? {} : { retryDelaySeconds }) };
    }

    // Durable before any callback attempt: SENT + provider reference + callback PENDING.
    await this.repository.recordEmailSent(event.eventId, providerMessageId);
    log.info({ providerMessageId, durationMs: Date.now() - started }, 'email accepted by provider');

    try {
      await this.callbacks.attemptForEvent(event.eventId);
    } catch (error) {
      // Callback state is already durable (PENDING); the retry worker will pick it up.
      log.warn({ err: error instanceof Error ? error.message : String(error), errorCategory: 'INTERNAL_COMMUNICATION' }, 'immediate callback attempt errored; worker will retry');
    }
    return { ack: true, outcome: 'SENT' };
  }

  private parse(message: IncomingMessage): CatalogEnquirySubmittedV1 | null {
    let json: unknown;
    try {
      json = JSON.parse(message.body);
    } catch {
      this.logger.error({ errorCategory: 'MESSAGING', correlationId: message.correlationId }, 'message body is not JSON');
      return null;
    }
    const parsed = catalogEnquirySubmittedV1Schema.safeParse(json);
    if (!parsed.success) {
      this.logger.error({ errorCategory: 'MESSAGING', correlationId: message.correlationId, issues: parsed.error.issues.map((i) => i.path.join('.')) }, 'message failed event contract validation');
      return null;
    }
    return parsed.data;
  }
}
