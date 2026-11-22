import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type pg from 'pg';
import type { CatalogEnquirySubmittedV1, NotificationStatusCallback, NotificationStatusCallbackResponse } from '@catalog/contracts';
import { DeliveryRepository } from '../../src/db/deliveryRepository.js';
import { SalesRecipientResolver, type EmailProvider, type OutgoingEmail } from '../../src/email/provider.js';
import { CatalogCallbackError, type CatalogClient } from '../../src/callback/catalogClient.js';
import { CircuitBreaker } from '../../src/callback/circuitBreaker.js';
import { CallbackService } from '../../src/callback/callbackService.js';
import { NotificationProcessor } from '../../src/processing/notificationProcessor.js';

export const silent = pino({ level: 'silent' });

export function makeEvent(type: 'PRODUCT' | 'CATEGORY' = 'PRODUCT'): CatalogEnquirySubmittedV1 {
  return {
    eventId: randomUUID(),
    eventType: 'CATALOG_ENQUIRY_SUBMITTED',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: 'it-corr',
    data: {
      enquiryId: randomUUID(),
      entity: type === 'PRODUCT' ? { type, id: '3', name: 'Cotton Jacket' } : { type, id: 'jewelery', name: 'jewelery' },
      customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' },
      message: 'Hello',
    },
  };
}

export class FakeEmailProvider implements EmailProvider {
  sent: OutgoingEmail[] = [];
  failNext = 0;
  async send(email: OutgoingEmail) {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('SMTP 421 service not available');
    }
    this.sent.push(email);
    return { providerMessageId: `msg-${this.sent.length}` };
  }
}

/** A provider whose send never settles (e.g. a hung SES connection). */
export class HangingEmailProvider extends FakeEmailProvider {
  override async send(): Promise<{ providerMessageId: string }> {
    return new Promise(() => undefined);
  }
}

/** Stands in for Catalog Service's internal API; can be switched to fail. */
export class FakeCatalog implements CatalogClient {
  calls: Array<{ enquiryId: string; payload: NotificationStatusCallback }> = [];
  mode: 'ok' | 'down' | 'not-found' = 'ok';
  async reportNotificationSent(enquiryId: string, payload: NotificationStatusCallback): Promise<NotificationStatusCallbackResponse> {
    this.calls.push({ enquiryId, payload });
    if (this.mode === 'down') throw new CatalogCallbackError('Catalog callback failed with HTTP 503', true, true, 503);
    if (this.mode === 'not-found') throw new CatalogCallbackError('Catalog callback rejected (HTTP 404)', false, false, 404);
    return { enquiryId, status: 'PROCESSED', callbackResult: this.calls.length > 1 ? 'DUPLICATE' : 'APPLIED' };
  }
}

export function build(pool: pg.Pool, opts: { email?: FakeEmailProvider; catalog?: FakeCatalog; breaker?: CircuitBreaker; maxAttempts?: number; emailSendTimeoutMs?: number } = {}) {
  const repository = new DeliveryRepository(pool);
  const email = opts.email ?? new FakeEmailProvider();
  const catalog = opts.catalog ?? new FakeCatalog();
  const breaker = opts.breaker ?? new CircuitBreaker({ failureThreshold: 5, openDurationMs: 30000, halfOpenMaxProbes: 1 });
  const callbacks = new CallbackService(repository, catalog, breaker, { retryBaseMs: 1, retryMaxMs: 2, maxAttempts: opts.maxAttempts ?? 50, claimLeaseMs: 5000 }, silent);
  const processor = new NotificationProcessor(repository, email, new SalesRecipientResolver({ PRODUCT: 'products@sales.test', CATEGORY: 'categories@sales.test' }), callbacks, silent, {
    emailFrom: 'catalog@notifications.test',
    emailLeaseMs: 30000,
    emailSendTimeoutMs: opts.emailSendTimeoutMs ?? 5000,
    emailRetryBaseSeconds: 1,
    maxReceiveCount: 5,
  });
  return { repository, email, catalog, breaker, callbacks, processor };
}

export async function ledger(pool: pg.Pool, eventId: string) {
  const result = await pool.query('SELECT email_status, callback_status, provider_message_id, attempt_count, callback_attempt_count, last_email_error, last_callback_error FROM notification_deliveries WHERE event_id = $1', [eventId]);
  return result.rows[0];
}
