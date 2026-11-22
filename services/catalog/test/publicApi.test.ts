import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createInternalApp, createPublicApp } from '../src/app.js';
import { CatalogService } from '../src/products/catalogService.js';
import { Errors, ProviderError } from '../src/errors.js';
import type { ProductProvider } from '../src/products/provider.js';
import { FEATURED, fixtureProvider, silentLogger } from './helpers.js';

const STATUS_ID = '6f1c1f5e-2f0a-4b8b-9b8e-7f8a1f6c1a11';

function buildApp(provider: ProductProvider = fixtureProvider()) {
  const createEnquiry = vi.fn(async () => ({ enquiryId: '6f1c1f5e-2f0a-4b8b-9b8e-7f8a1f6c1a11', eventId: 'e', status: 'RECEIVED' as const }));
  const applyNotificationCallback = vi.fn();
  const getEnquiryStatus = vi.fn(async (id: string) => {
    return { enquiryId: id, status: 'PROCESSED' as const, entity: { type: 'PRODUCT' as const, id: '1', name: 'Backpack' }, receivedAt: '2026-11-22T09:00:00.000Z', processedAt: '2026-11-22T09:00:02.000Z', resolvedAt: null };
  });
  const app = createPublicApp({
    logger: silentLogger,
    catalog: new CatalogService(provider, FEATURED),
    enquiries: { createEnquiry, applyNotificationCallback, getEnquiryStatus },
    pool: { query: vi.fn(async () => ({ rows: [] })) } as never,
    enquiryRateLimitPerMinute: 3,
    trustProxyHops: 0,
  });
  return { app, createEnquiry, getEnquiryStatus };
}

const validEnquiry = {
  entity: { type: 'PRODUCT', id: '1' },
  customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' },
  message: 'Please share more details.',
};

describe('public catalogue API', () => {
  it('GET /products/featured returns five products in the data envelope', async () => {
    const res = await request(buildApp().app).get('/api/catalog/products/featured');
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(5);
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('GET /products?q= searches; empty q is rejected', async () => {
    const { app } = buildApp();
    const ok = await request(app).get('/api/catalog/products').query({ q: 'ssd' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.products.length).toBeGreaterThan(0);
    const bad = await request(app).get('/api/catalog/products').query({ q: '  ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /products/:id returns details, 404 for missing and 400 for malformed ids', async () => {
    const { app } = buildApp();
    const ok = await request(app).get('/api/catalog/products/3');
    expect(ok.body.data.product).toMatchObject({ id: '3', rating: { rate: 4.7, count: 500 } });
    expect((await request(app).get('/api/catalog/products/999')).body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect((await request(app).get('/api/catalog/products/%3Cscript%3E')).status).toBe(400);
  });

  it('GET /categories/:id/products handles URL-encoded category names', async () => {
    const res = await request(buildApp().app).get(`/api/catalog/categories/${encodeURIComponent("men's clothing")}/products`);
    expect(res.status).toBe(200);
    expect(res.body.data.category.id).toBe("men's clothing");
    expect(res.body.data.topRated).toHaveLength(4);
  });

  it.each([
    ['UNAVAILABLE', 503, 'PRODUCT_PROVIDER_UNAVAILABLE'],
    ['INVALID_RESPONSE', 502, 'PRODUCT_PROVIDER_INVALID_RESPONSE'],
    ['TIMEOUT', 504, 'PRODUCT_PROVIDER_TIMEOUT'],
  ] as const)('maps provider %s to HTTP %i without leaking internals', async (kind, status, code) => {
    const failing: ProductProvider = {
      listProducts: () => Promise.reject(new ProviderError(kind, 'secret upstream detail')),
      getProduct: () => Promise.reject(new ProviderError(kind, 'secret upstream detail')),
    };
    const res = await request(buildApp(failing).app).get('/api/catalog/products/featured');
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain('secret upstream detail');
  });

  it('does not expose internal routes on the public listener', async () => {
    const res = await request(buildApp().app).patch('/internal/catalog/enquiries/x/notification-status').send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/catalog/enquiries', () => {
  it('returns 202 RECEIVED for a valid enquiry', async () => {
    const { app, createEnquiry } = buildApp();
    const res = await request(app).post('/api/catalog/enquiries').set('X-Correlation-ID', 'corr-123').send(validEnquiry);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ enquiryId: expect.any(String), status: 'RECEIVED', message: 'Your enquiry has been received.' });
    expect(createEnquiry).toHaveBeenCalledWith(expect.objectContaining({ entity: { type: 'PRODUCT', id: '1' } }), 'corr-123');
  });

  it('returns 422 with field details for invalid values', async () => {
    const { app, createEnquiry } = buildApp();
    const res = await request(app)
      .post('/api/catalog/enquiries')
      .send({ ...validEnquiry, customer: { ...validEnquiry.customer, email: 'bad' } });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: 'customer.email' })]);
    expect(createEnquiry).not.toHaveBeenCalled();
  });

  it('rejects a client-supplied recipient as a structural error (400)', async () => {
    const res = await request(buildApp().app).post('/api/catalog/enquiries').send({ ...validEnquiry, recipient: 'x@evil.test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when entity is not an object, 422 when a required section is missing', async () => {
    const { app } = buildApp();
    expect((await request(app).post('/api/catalog/enquiries').send({ ...validEnquiry, entity: 'PRODUCT:1' })).status).toBe(400);
    const { customer: _customer, ...noCustomer } = validEnquiry;
    expect((await request(app).post('/api/catalog/enquiries').send(noCustomer)).status).toBe(422);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(buildApp().app).post('/api/catalog/enquiries').set('Content-Type', 'application/json').send('{"entity":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('rate-limits enquiry submission', async () => {
    const { app } = buildApp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await request(app).post('/api/catalog/enquiries').send(validEnquiry)).status);
    expect(statuses).toEqual([202, 202, 202, 429]);
  });
});

describe('GET /api/catalog/enquiries/:enquiryId (status)', () => {
  it('returns the PII-free lifecycle view with no-store caching', async () => {
    const res = await request(buildApp().app).get(`/api/catalog/enquiries/${STATUS_ID.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toEqual({ enquiryId: STATUS_ID, status: 'PROCESSED', entity: { type: 'PRODUCT', id: '1', name: 'Backpack' }, receivedAt: '2026-11-22T09:00:00.000Z', processedAt: '2026-11-22T09:00:02.000Z', resolvedAt: null });
  });

  it('rejects a malformed id with 400 without hitting the service', async () => {
    const { app, getEnquiryStatus } = buildApp();
    const res = await request(app).get('/api/catalog/enquiries/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(getEnquiryStatus).not.toHaveBeenCalled();
  });

  it('maps a database failure to 503 with a read-specific message and no-store (RV6-03)', async () => {
    const { app, getEnquiryStatus } = buildApp();
    getEnquiryStatus.mockRejectedValueOnce(Errors.databaseReadUnavailable(new Error('connection terminated')));
    const res = await request(app).get(`/api/catalog/enquiries/${STATUS_ID}`);
    expect(res.status).toBe(503);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error).toMatchObject({ code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unable to read data. Please retry.' });
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });

  it('is rate limited', async () => {
    const { app } = buildApp();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await request(app).get(`/api/catalog/enquiries/${STATUS_ID}`)).status);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('internal callback API authentication', () => {
  const internal = createInternalApp({
    logger: silentLogger,
    enquiries: { applyNotificationCallback: vi.fn(async (id: string) => ({ enquiryId: id, status: 'PROCESSED' as const, callbackResult: 'APPLIED' as const })) },
    internalToken: 'test-internal-token-123',
  });
  const path = '/internal/catalog/enquiries/6f1c1f5e-2f0a-4b8b-9b8e-7f8a1f6c1a11/notification-status';
  const body = { eventId: '0b9a3b6c-8a1b-4f53-9a43-3c6c8d1f2e11', notificationStatus: 'SENT', providerMessageId: 'm-1', processedAt: new Date().toISOString() };

  it('rejects missing or wrong credentials with 401', async () => {
    expect((await request(internal).patch(path).send(body)).status).toBe(401);
    expect((await request(internal).patch(path).set('Authorization', 'Bearer wrong').send(body)).status).toBe(401);
  });

  it('accepts an authenticated, valid callback', async () => {
    const res = await request(internal).patch(path).set('Authorization', 'Bearer test-internal-token-123').send(body);
    expect(res.status).toBe(200);
    expect(res.body.callbackResult).toBe('APPLIED');
  });

  it('rejects an invalid callback payload with 400', async () => {
    const res = await request(internal).patch(path).set('Authorization', 'Bearer test-internal-token-123').send({ ...body, notificationStatus: 'FAILED' });
    expect(res.status).toBe(400);
  });
});
