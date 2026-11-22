import { randomUUID } from 'node:crypto';
import {
  CATALOG_ENQUIRY_SUBMITTED,
  catalogEnquirySubmittedV1Schema,
  type CallbackResult,
  type CatalogEnquirySubmittedV1,
  type EnquiryRequest,
  type EnquiryStatus,
  type EnquiryStatusResponse,
  type NotificationStatusCallback,
} from '@catalog/contracts';
import { AppError, Errors } from '../errors.js';
import { withTransaction, type Pool } from '../db/pool.js';
import type { CatalogService } from '../products/catalogService.js';
import { assertTransition, decideNotificationCallback, InvalidTransitionError } from './lifecycle.js';
import { enquiryRepository, type EntitySnapshot } from './repository.js';

export interface CreatedEnquiry {
  enquiryId: string;
  eventId: string;
  status: 'RECEIVED';
}

export interface CallbackOutcome {
  enquiryId: string;
  status: EnquiryStatus;
  callbackResult: CallbackResult;
}

export class EnquiryService {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Validates the referenced entity, then persists the enquiry (RECEIVED) and its outbox
   * event in a single transaction. Returns only after commit.
   */
  async createEnquiry(request: EnquiryRequest, correlationId: string): Promise<CreatedEnquiry> {
    const snapshot = await this.resolveEntity(request.entity.type, request.entity.id);
    const enquiryId = randomUUID();
    const eventId = randomUUID();
    const receivedAt = new Date();

    const event: CatalogEnquirySubmittedV1 = catalogEnquirySubmittedV1Schema.parse({
      eventId,
      eventType: CATALOG_ENQUIRY_SUBMITTED,
      eventVersion: 1,
      occurredAt: receivedAt.toISOString(),
      correlationId,
      data: {
        enquiryId,
        entity: { type: snapshot.type, id: snapshot.id, name: snapshot.name },
        customer: request.customer,
        ...(request.message ? { message: request.message } : {}),
      },
    });

    try {
      await withTransaction(this.pool, async (client) => {
        await enquiryRepository.insertEnquiry(client, {
          id: enquiryId,
          entity: snapshot,
          customer: request.customer,
          ...(request.message ? { message: request.message } : {}),
          receivedAt,
        });
        await enquiryRepository.insertOutboxEvent(client, event);
      });
    } catch (error) {
      throw Errors.databaseUnavailable(error);
    }
    return { enquiryId, eventId, status: 'RECEIVED' };
  }

  /**
   * Applies a successful-notification callback atomically and idempotently.
   * The enquiry row is locked first so concurrent duplicates serialize.
   */
  async applyNotificationCallback(enquiryId: string, callback: NotificationStatusCallback): Promise<CallbackOutcome> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const enquiry = await enquiryRepository.lockEnquiry(client, enquiryId);
        if (!enquiry) throw Errors.notFound('ENQUIRY_NOT_FOUND', 'The enquiry does not exist.');

        const eventAggregate = await enquiryRepository.findEventAggregate(client, callback.eventId);
        if (eventAggregate !== enquiryId) {
          throw Errors.conflict('EVENT_ENQUIRY_MISMATCH', 'The event does not belong to this enquiry.');
        }

        const previous = await enquiryRepository.findProcessedEvent(client, callback.eventId);
        if (previous) return { enquiryId, status: enquiry.status, callbackResult: 'DUPLICATE' as const };

        const decision = decideNotificationCallback(enquiry.status);
        switch (decision.action) {
          case 'APPLY':
            assertTransition(enquiry.status, 'PROCESSED');
            await enquiryRepository.markProcessed(client, enquiryId);
            await enquiryRepository.recordProcessedEvent(client, callback.eventId, enquiryId, 'APPLIED');
            return { enquiryId, status: 'PROCESSED' as const, callbackResult: 'APPLIED' as const };
          case 'ALREADY_PROCESSED':
            // Only one submission event exists per enquiry, so this is a safe repeat.
            await enquiryRepository.recordProcessedEvent(client, callback.eventId, enquiryId, 'APPLIED');
            return { enquiryId, status: enquiry.status, callbackResult: 'DUPLICATE' as const };
          case 'STALE_IGNORED':
            await enquiryRepository.recordProcessedEvent(client, callback.eventId, enquiryId, 'STALE_IGNORED');
            return { enquiryId, status: enquiry.status, callbackResult: 'STALE_IGNORED' as const };
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof InvalidTransitionError) throw Errors.conflict('INVALID_TRANSITION', error.message);
      throw Errors.databaseUnavailable(error);
    }
  }

  /** Read-only, PII-free lifecycle view (ASM-035). */
  async getEnquiryStatus(enquiryId: string): Promise<EnquiryStatusResponse> {
    let row;
    try {
      row = await enquiryRepository.findStatus(this.pool, enquiryId);
    } catch (error) {
      throw Errors.databaseReadUnavailable(error);
    }
    if (!row) throw Errors.notFound('ENQUIRY_NOT_FOUND', 'The enquiry does not exist.');
    return {
      enquiryId: row.id,
      status: row.status,
      entity: { type: row.entity_type, id: row.entity_id, name: row.entity_name },
      receivedAt: row.received_at.toISOString(),
      processedAt: row.processed_at?.toISOString() ?? null,
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }

  /**
   * Domain operation for the future authenticated sales workflow (ASM-024).
   * Intentionally not exposed through any HTTP route.
   */
  async resolveEnquiry(enquiryId: string, resolvedBy: string, notes?: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const enquiry = await enquiryRepository.lockEnquiry(client, enquiryId);
      if (!enquiry) throw Errors.notFound('ENQUIRY_NOT_FOUND', 'The enquiry does not exist.');
      assertTransition(enquiry.status, 'RESOLVED');
      await enquiryRepository.markResolved(client, enquiryId, resolvedBy, notes ?? null);
    });
  }

  private async resolveEntity(type: EnquiryRequest['entity']['type'], id: string): Promise<EntitySnapshot> {
    if (type === 'PRODUCT') {
      const product = await this.catalog.findProduct(id);
      if (!product) throw new AppError(422, 'ENTITY_NOT_FOUND', 'The referenced product does not exist.', [{ field: 'entity.id', message: 'Unknown product.' }]);
      return { type, id: product.id, name: product.title, category: product.category, price: product.price };
    }
    const category = await this.catalog.findCategory(id);
    if (!category) throw new AppError(422, 'ENTITY_NOT_FOUND', 'The referenced category does not exist.', [{ field: 'entity.id', message: 'Unknown category.' }]);
    return { type, id: category.id, name: category.name };
  }
}
