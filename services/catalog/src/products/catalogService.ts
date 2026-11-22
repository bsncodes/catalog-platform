import type { Category, CategoryProducts, Product } from '@catalog/contracts';
import { AppError, Errors } from '../errors.js';
import type { ProductProvider } from './provider.js';

export const TOP_RATED_LIMIT = 5;

/** Rating descending; unrated products last; ties broken by numeric-aware product id ascending (ASM-003). */
export function compareByRating(a: Product, b: Product): number {
  const rateA = a.rating?.rate ?? -1;
  const rateB = b.rating?.rate ?? -1;
  if (rateA !== rateB) return rateB - rateA;
  return a.id.localeCompare(b.id, 'en', { numeric: true });
}

export function toCategory(name: string): Category {
  return { id: name, name };
}

export class CatalogService {
  constructor(
    private readonly provider: ProductProvider,
    private readonly featuredProductIds: readonly string[],
  ) {}

  async getFeaturedProducts(): Promise<Product[]> {
    const products = await this.provider.listProducts();
    const byId = new Map(products.map((product) => [product.id, product]));
    const featured: Product[] = [];
    for (const id of this.featuredProductIds) {
      const product = byId.get(id);
      if (!product) {
        // ASM-031: a configured featured product that the provider no longer returns is a
        // configuration/data mismatch; surface it rather than silently showing fewer than five.
        throw new AppError(502, 'FEATURED_PRODUCT_UNAVAILABLE', 'A configured featured product is not available from the product catalogue.');
      }
      featured.push(product);
    }
    return featured;
  }

  async listProducts(query?: string): Promise<Product[]> {
    const products = await this.provider.listProducts();
    if (query === undefined) return products;
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) throw Errors.validation('A non-empty search term is required.', [{ field: 'q', message: 'A non-empty search term is required.' }]);
    return products.filter((product) =>
      [product.title, product.description, product.category].some((field) => field.toLowerCase().includes(needle)),
    );
  }

  async getProduct(id: string): Promise<Product> {
    const product = await this.provider.getProduct(id);
    if (!product) throw Errors.notFound('PRODUCT_NOT_FOUND', 'The requested product does not exist.');
    return product;
  }

  async findProduct(id: string): Promise<Product | null> {
    return this.provider.getProduct(id);
  }

  async listCategories(): Promise<Category[]> {
    const products = await this.provider.listProducts();
    const names = [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b));
    return names.map(toCategory);
  }

  async findCategory(categoryId: string): Promise<Category | null> {
    const categories = await this.listCategories();
    return categories.find((category) => category.id === categoryId) ?? null;
  }

  async getCategoryProducts(categoryId: string): Promise<CategoryProducts> {
    const products = await this.provider.listProducts();
    const inCategory = products.filter((product) => product.category === categoryId);
    if (inCategory.length === 0) throw Errors.notFound('CATEGORY_NOT_FOUND', 'The requested category does not exist.');
    const ranked = [...inCategory].sort(compareByRating);
    const topRated = ranked.slice(0, TOP_RATED_LIMIT);
    const topIds = new Set(topRated.map((product) => product.id));
    const additionalProducts = inCategory
      .filter((product) => !topIds.has(product.id))
      .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    return { category: toCategory(categoryId), topRated, additionalProducts };
  }
}
