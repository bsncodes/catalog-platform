import type { Product } from '@catalog/contracts';
import { vi } from 'vitest';

export const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  title: `Product ${id}`,
  description: `Description ${id}`,
  category: 'electronics',
  imageUrl: `https://img.test/${id}.png`,
  price: { amount: 10 + Number(id), currency: 'USD' },
  rating: { rate: 4, count: 100 + Number(id) },
  ...overrides,
});

type Handler = (url: URL, init?: RequestInit) => { status: number; body: unknown };

/** Routes mocked fetch calls by path; records every request. Fails the test on unexpected hosts. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.host !== 'localhost') throw new Error(`Unexpected external request to ${url.host}`);
    calls.push({ url, ...(init ? { init } : {}) });
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'ROUTE_NOT_FOUND', message: 'Not found' } }), { status: 404 });
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const categoriesRoute = { 'GET /api/catalog/categories': () => ({ status: 200, body: { data: { categories: [{ id: 'electronics', name: 'electronics' }, { id: "men's clothing", name: "men's clothing" }] } } }) };
