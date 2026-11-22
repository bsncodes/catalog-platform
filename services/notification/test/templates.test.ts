import { describe, expect, it } from 'vitest';
import type { CatalogEnquirySubmittedV1 } from '@catalog/contracts';
import { renderEnquiryEmail } from '../src/templates/index.js';
import { SalesRecipientResolver } from '../src/email/provider.js';

const event = (type: 'PRODUCT' | 'CATEGORY', overrides: Partial<CatalogEnquirySubmittedV1['data']> = {}): CatalogEnquirySubmittedV1 => ({
  eventId: 'f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11',
  eventType: 'CATALOG_ENQUIRY_SUBMITTED',
  eventVersion: 1,
  occurredAt: '2026-11-22T10:15:30.000Z',
  data: {
    enquiryId: 'c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1',
    entity: type === 'PRODUCT' ? { type, id: '3', name: 'Cotton Jacket' } : { type, id: 'jewelery', name: 'jewelery' },
    customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' },
    message: 'Please share details.',
    ...overrides,
  },
});

describe('enquiry email templates', () => {
  it('selects the PRODUCT template with product and customer details in text and HTML', () => {
    const email = renderEnquiryEmail(event('PRODUCT'));
    expect(email.subject).toBe('New product enquiry: Cotton Jacket');
    for (const part of [email.text, email.html]) {
      expect(part).toContain('Cotton Jacket');
      expect(part).toContain('Jane Doe');
      expect(part).toContain('jane@example.com');
      expect(part).toContain('+919876543210');
      expect(part).toContain('c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1');
    }
  });

  it('selects the CATEGORY template', () => {
    const email = renderEnquiryEmail(event('CATEGORY'));
    expect(email.subject).toBe('New category enquiry: jewelery');
    expect(email.text).toContain('Category: jewelery');
  });

  it('escapes customer-provided content in HTML but keeps it readable in text', () => {
    const email = renderEnquiryEmail(event('PRODUCT', { customer: { name: '<script>alert(1)</script>', email: 'a@b.co', phone: '+911234567' }, message: '<img src=x onerror=alert(1)> & "quotes"' }));
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&amp; &quot;quotes&quot;');
    expect(email.text).toContain('<script>alert(1)</script>');
  });

  it('strips line breaks from the subject (header injection)', () => {
    const email = renderEnquiryEmail(event('PRODUCT', { entity: { type: 'PRODUCT', id: '3', name: 'Jacket\r\nBcc: attacker@example.com' } }));
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it('handles an absent message', () => {
    const { message: _m, ...data } = event('PRODUCT').data;
    const email = renderEnquiryEmail({ ...event('PRODUCT'), data });
    expect(email.text).toContain('(no message provided)');
  });
});

describe('SalesRecipientResolver', () => {
  it('resolves recipients only from server configuration by entity type', () => {
    const resolver = new SalesRecipientResolver({ PRODUCT: 'products@sales.test', CATEGORY: 'categories@sales.test' });
    expect(resolver.resolve('PRODUCT')).toBe('products@sales.test');
    expect(resolver.resolve('CATEGORY')).toBe('categories@sales.test');
  });
});
