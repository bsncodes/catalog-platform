import { describe, expect, it, vi } from 'vitest';
import { CatalogCallbackError, HttpCatalogClient } from '../src/callback/catalogClient.js';

const payload = { eventId: 'f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11', notificationStatus: 'SENT' as const, providerMessageId: 'm1', processedAt: '2026-11-22T10:15:32.000Z' };
const client = (fetchImpl: typeof fetch) => new HttpCatalogClient({ baseUrl: 'http://catalog:3001', token: 'secret-token-123456', timeoutMs: 50, fetchImpl });

describe('HttpCatalogClient', () => {
  it('sends an authenticated PATCH with correlation id and parses the response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ enquiryId: 'e1', status: 'PROCESSED', callbackResult: 'APPLIED' }), { status: 200 }));
    const result = await client(fetchImpl).reportNotificationSent('e1', payload, 'corr-1');
    expect(result.callbackResult).toBe('APPLIED');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://catalog:3001/internal/catalog/enquiries/e1/notification-status');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toMatchObject({ authorization: 'Bearer secret-token-123456', 'x-correlation-id': 'corr-1' });
  });

  it.each([
    [503, true, true],
    [500, true, true],
    [401, true, false],
    [404, false, false],
    [409, false, false],
    [400, false, false],
  ])('classifies HTTP %i as retryable=%s healthFailure=%s', async (status, retryable, healthFailure) => {
    const error = await client(async () => new Response('{}', { status })).reportNotificationSent('e1', payload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogCallbackError);
    expect(error).toMatchObject({ retryable, healthFailure, status });
  });

  it('treats network errors and timeouts as retryable health failures', async () => {
    const network = await client(async () => Promise.reject(new TypeError('ECONNREFUSED'))).reportNotificationSent('e1', payload).catch((e: unknown) => e);
    expect(network).toMatchObject({ retryable: true, healthFailure: true });
    const slow: typeof fetch = (_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    const timeout = await client(slow).reportNotificationSent('e1', payload).catch((e: unknown) => e);
    expect(timeout).toMatchObject({ retryable: true, healthFailure: true, message: 'Catalog callback timed out' });
  });
});
