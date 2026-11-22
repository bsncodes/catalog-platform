import { describe, expect, it } from 'vitest';
import { catalogEnquirySubmittedV1Schema, enquiryRequestSchema } from './index.js';

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
