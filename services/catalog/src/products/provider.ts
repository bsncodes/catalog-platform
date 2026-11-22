import type { Product } from '@catalog/contracts';

/**
 * Replaceable product source. Implementations must validate and normalize their
 * upstream data and throw ProviderError for upstream failures; they must never
 * return an empty list to mask a failure.
 */
export interface ProductProvider {
  listProducts(): Promise<Product[]>;
  /** Returns null when the product does not exist upstream. */
  getProduct(id: string): Promise<Product | null>;
}
