import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Product } from '@catalog/contracts';
import type { ProductProvider } from './provider.js';
import { fakeStoreProductSchema, toProduct } from './fakeStoreMapper.js';

/**
 * Deterministic, offline product source backed by a committed snapshot of Fake Store data.
 * Used for automated tests and fully offline local runs (PRODUCT_PROVIDER=fixture).
 */
export class FixtureProductProvider implements ProductProvider {
  private readonly products: Product[];

  constructor(products: Product[]) {
    this.products = products;
  }

  static fromFile(path: string, currency: string): FixtureProductProvider {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const parsed = z.array(fakeStoreProductSchema).parse(raw);
    return new FixtureProductProvider(parsed.map((item) => toProduct(item, currency)));
  }

  async listProducts(): Promise<Product[]> {
    return this.products.map((product) => ({ ...product }));
  }

  async getProduct(id: string): Promise<Product | null> {
    const product = this.products.find((candidate) => candidate.id === id);
    return product ? { ...product } : null;
  }
}
