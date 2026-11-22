import { describe, expect, it } from 'vitest';
import type { Product } from '@catalog/contracts';
import { CatalogService, compareByRating } from '../src/products/catalogService.js';
import { FixtureProductProvider } from '../src/products/fixtureProvider.js';
import { ProviderError } from '../src/errors.js';
import type { ProductProvider } from '../src/products/provider.js';
import { FEATURED, fixtureProvider } from './helpers.js';

const product = (id: string, category: string, rate: number | null): Product => ({
  id,
  title: `Product ${id}`,
  description: 'desc',
  category,
  imageUrl: 'https://example.com/x.png',
  price: { amount: 1, currency: 'USD' },
  rating: rate === null ? null : { rate, count: 10 },
});

describe('CatalogService.getFeaturedProducts', () => {
  it('returns exactly the five configured products in configured order', async () => {
    const service = new CatalogService(fixtureProvider(), FEATURED);
    const featured = await service.getFeaturedProducts();
    expect(featured.map((p) => p.id)).toEqual([...FEATURED]);
  });

  it('fails explicitly when a configured product is missing instead of returning fewer than five', async () => {
    const service = new CatalogService(fixtureProvider(), ['1', '2', '3', '4', '999']);
    await expect(service.getFeaturedProducts()).rejects.toMatchObject({ status: 502, code: 'FEATURED_PRODUCT_UNAVAILABLE' });
  });
});

describe('CatalogService.getCategoryProducts', () => {
  it('returns the five highest rated products, then the remainder without duplicates', async () => {
    const service = new CatalogService(fixtureProvider(), FEATURED);
    const result = await service.getCategoryProducts("women's clothing");
    expect(result.topRated).toHaveLength(5);
    const rates = result.topRated.map((p) => p.rating?.rate ?? -1);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
    const topIds = new Set(result.topRated.map((p) => p.id));
    expect(result.additionalProducts.every((p) => !topIds.has(p.id))).toBe(true);
    expect(result.topRated.length + result.additionalProducts.length).toBe(6);
    expect([...result.topRated, ...result.additionalProducts].every((p) => p.category === "women's clothing")).toBe(true);
  });

  it('breaks rating ties by numeric product id ascending and puts unrated products last', async () => {
    const provider = new FixtureProductProvider([
      product('10', 'c', 4.5),
      product('2', 'c', 4.5),
      product('3', 'c', null),
      product('4', 'c', 5),
    ]);
    const result = await new CatalogService(provider, FEATURED).getCategoryProducts('c');
    expect(result.topRated.map((p) => p.id)).toEqual(['4', '2', '10', '3']);
    expect(result.additionalProducts).toEqual([]);
  });

  it('throws CATEGORY_NOT_FOUND for an unknown category', async () => {
    const service = new CatalogService(fixtureProvider(), FEATURED);
    await expect(service.getCategoryProducts('toys')).rejects.toMatchObject({ status: 404, code: 'CATEGORY_NOT_FOUND' });
  });

  it('compareByRating is deterministic', () => {
    const a = product('1', 'c', 4);
    const b = product('2', 'c', 4);
    expect(compareByRating(a, b)).toBeLessThan(0);
    expect(compareByRating(b, a)).toBeGreaterThan(0);
  });
});

describe('CatalogService.listProducts (search)', () => {
  const service = new CatalogService(fixtureProvider(), FEATURED);

  it('matches title case-insensitively and partially', async () => {
    const results = await service.listProducts('BACKPACK');
    expect(results.map((p) => p.id)).toEqual(['1']);
  });

  it('matches description text', async () => {
    const results = await service.listProducts('Limited WARRANTY');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.description.toLowerCase().includes('limited warranty'))).toBe(true);
  });

  it('matches category', async () => {
    const results = await service.listProducts('jewel');
    expect(results.length).toBe(4);
    expect(results.every((p) => p.category === 'jewelery' || `${p.title} ${p.description}`.toLowerCase().includes('jewel'))).toBe(true);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await service.listProducts('zzzz-no-such-thing')).toEqual([]);
  });

  it('rejects a whitespace-only query', async () => {
    await expect(service.listProducts('   ')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('propagates provider failures rather than returning an empty result', async () => {
    const failing: ProductProvider = {
      listProducts: () => Promise.reject(new ProviderError('UNAVAILABLE', 'down')),
      getProduct: () => Promise.reject(new ProviderError('UNAVAILABLE', 'down')),
    };
    await expect(new CatalogService(failing, FEATURED).listProducts('bag')).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('CatalogService.listCategories', () => {
  it('derives sorted distinct categories from products', async () => {
    const categories = await new CatalogService(fixtureProvider(), FEATURED).listCategories();
    expect(categories.map((c) => c.id)).toEqual(['electronics', 'jewelery', "men's clothing", "women's clothing"]);
  });
});
