import { describe, expect, it, vi } from 'vitest';
import { FakeStoreProvider } from '../src/products/fakeStoreProvider.js';

const raw = {
  id: 7,
  title: '  Gold Ring ',
  price: 9.99,
  description: 'Shiny',
  category: 'Jewelery',
  image: 'https://fakestoreapi.com/img/7.png',
  rating: { rate: 3, count: 400 },
};

function providerWith(fetchImpl: typeof fetch): FakeStoreProvider {
  return new FakeStoreProvider({ baseUrl: 'https://fake.test', timeoutMs: 50, currency: 'USD', fetchImpl });
}

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('FakeStoreProvider', () => {
  it('normalizes the upstream shape into the internal product model', async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse([raw])));
    const [product] = await provider.listProducts();
    expect(product).toEqual({
      id: '7',
      title: 'Gold Ring',
      description: 'Shiny',
      category: 'jewelery',
      imageUrl: 'https://fakestoreapi.com/img/7.png',
      price: { amount: 9.99, currency: 'USD' },
      rating: { rate: 3, count: 400 },
    });
    expect(product).not.toHaveProperty('image');
  });

  it('maps missing rating to null', async () => {
    const { rating: _rating, ...noRating } = raw;
    const provider = providerWith(vi.fn(async () => jsonResponse(noRating)));
    expect((await provider.getProduct('7'))?.rating).toBeNull();
  });

  it('returns null for an unknown product (Fake Store answers with an empty body)', async () => {
    const provider = providerWith(vi.fn(async () => new Response('', { status: 200 })));
    expect(await provider.getProduct('999')).toBeNull();
  });

  it('returns null without calling upstream for a non-numeric id', async () => {
    const fetchImpl = vi.fn();
    expect(await providerWith(fetchImpl).getProduct('abc')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies an invalid upstream payload as INVALID_RESPONSE', async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse([{ id: 'x' }])));
    await expect(provider.listProducts()).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });

  it('classifies upstream 5xx as UNAVAILABLE', async () => {
    const provider = providerWith(vi.fn(async () => new Response('oops', { status: 503 })));
    await expect(provider.listProducts()).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('classifies network errors as UNAVAILABLE', async () => {
    const provider = providerWith(vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(provider.listProducts()).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('classifies a slow upstream as TIMEOUT', async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    await expect(providerWith(slow).listProducts()).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });
});
