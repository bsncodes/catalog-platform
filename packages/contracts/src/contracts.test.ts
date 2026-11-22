import { describe, expect, it } from 'vitest';
import {
  catalogEnquirySubmittedV1Schema,
  enquiryRequestSchema,
  notificationStatusCallbackResponseSchema,
  notificationStatusCallbackSchema,
} from './index.js';

const valid = {
  entity: { type: 'PRODUCT', id: '1' },
  customer: { name: ' Jane ', email: 'jane@example.com', phone: '+91 98765 43210' },
  message: 'Hello',
};

describe('enquiryRequestSchema', () => {
  it('accepts a valid request and trims values', () => {
    const parsed = enquiryRequestSchema.parse(valid);
    expect(parsed.customer.name).toBe('Jane');
  });

  it('treats an empty message as absent', () => {
    const parsed = enquiryRequestSchema.parse({ ...valid, message: '   ' });
    expect(parsed.message).toBeUndefined();
  });

  it.each([
    ['invalid email', { ...valid, customer: { ...valid.customer, email: 'nope' } }],
    ['short phone', { ...valid, customer: { ...valid.customer, phone: '123' } }],
    ['letters in phone', { ...valid, customer: { ...valid.customer, phone: 'call-me-maybe' } }],
    ['blank name', { ...valid, customer: { ...valid.customer, name: '   ' } }],
    ['unknown entity type', { ...valid, entity: { type: 'ORDER', id: '1' } }],
    ['client-supplied recipient', { ...valid, recipient: 'attacker@example.com' }],
    ['message too long', { ...valid, message: 'x'.repeat(2001) }],
  ])('rejects %s', (_label, input) => {
    expect(enquiryRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('catalogEnquirySubmittedV1Schema', () => {
  it('rejects an unknown event version', () => {
    const result = catalogEnquirySubmittedV1Schema.safeParse({
      eventId: '0b9a3b6c-8a1b-4f53-9a43-3c6c8d1f2e11',
      eventType: 'CATALOG_ENQUIRY_SUBMITTED',
      eventVersion: 2,
      occurredAt: new Date().toISOString(),
      data: {},
    });
    expect(result.success).toBe(false);
  });
});

const canonicalEvent = {
  eventId: 'f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11',
  eventType: 'CATALOG_ENQUIRY_SUBMITTED',
  eventVersion: 1,
  occurredAt: '2026-11-22T10:15:30.000Z',
  correlationId: 'req-01JEXAMPLE',
  data: {
    enquiryId: 'c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1',
    entity: { type: 'PRODUCT', id: '101', name: 'Example product' },
    customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' },
    message: 'Please share more details.',
  },
};

describe('catalogEnquirySubmittedV1Schema (RV1-01)', () => {
  it('accepts the canonical documented example', () => {
    expect(catalogEnquirySubmittedV1Schema.safeParse(canonicalEvent).success).toBe(true);
  });

  it.each([
    ['whitespace-only entity name', { entity: { type: 'PRODUCT', id: '101', name: '   ' } }],
    ['whitespace-only customer phone', { customer: { ...canonicalEvent.data.customer, phone: '   ' } }],
    ['whitespace-only customer name', { customer: { ...canonicalEvent.data.customer, name: ' ' } }],
    ['message over 2000 characters', { message: 'x'.repeat(2001) }],
  ])('rejects %s', (_label, override) => {
    const event = { ...canonicalEvent, data: { ...canonicalEvent.data, ...override } };
    expect(catalogEnquirySubmittedV1Schema.safeParse(event).success).toBe(false);
  });
});

describe('enquiry request limits match openapi.yaml (RV1-03)', () => {
  const at = (overrides: { name?: string; phone?: string; id?: string }) => ({
    entity: { type: 'PRODUCT', id: overrides.id ?? '1' },
    customer: { name: overrides.name ?? 'Jane', email: 'jane@example.com', phone: overrides.phone ?? '+919876543210' },
  });

  it('accepts values at the documented maximum and rejects max + 1', () => {
    expect(enquiryRequestSchema.safeParse(at({ name: 'n'.repeat(120) })).success).toBe(true);
    expect(enquiryRequestSchema.safeParse(at({ name: 'n'.repeat(121) })).success).toBe(false);
    expect(enquiryRequestSchema.safeParse(at({ id: '1'.repeat(128) })).success).toBe(true);
    expect(enquiryRequestSchema.safeParse(at({ id: '1'.repeat(129) })).success).toBe(false);
    expect(enquiryRequestSchema.safeParse(at({ phone: `+1 ${'1'.repeat(14)}`.padEnd(32, '-') })).success).toBe(true);
    expect(enquiryRequestSchema.safeParse(at({ phone: `+1 ${'1'.repeat(14)}`.padEnd(33, '-') })).success).toBe(false);
  });
});

describe('notification-status callback contracts (RV1-04)', () => {
  const valid = { eventId: 'f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11', notificationStatus: 'SENT', providerMessageId: 'provider-message-123', processedAt: '2026-11-22T10:15:32.000Z' };

  it('accepts a valid SENT callback', () => {
    expect(notificationStatusCallbackSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['non-SENT status', { ...valid, notificationStatus: 'FAILED' }],
    ['non-UUID event id', { ...valid, eventId: 'event-123' }],
    ['unknown field (strict)', { ...valid, status: 'PROCESSED' }],
    ['providerMessageId over 256 chars', { ...valid, providerMessageId: 'p'.repeat(257) }],
    ['timestamp without offset', { ...valid, processedAt: '2026-11-22 10:15' }],
  ])('rejects %s', (_label, input) => {
    expect(notificationStatusCallbackSchema.safeParse(input).success).toBe(false);
  });

  it('response schema accepts only the documented callback results', () => {
    expect(notificationStatusCallbackResponseSchema.safeParse({ enquiryId: 'x', status: 'PROCESSED', callbackResult: 'APPLIED' }).success).toBe(true);
    expect(notificationStatusCallbackResponseSchema.safeParse({ enquiryId: 'x', status: 'PROCESSED', callbackResult: 'OK' }).success).toBe(false);
  });
});
