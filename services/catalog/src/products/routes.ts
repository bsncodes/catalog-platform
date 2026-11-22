import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../errors.js';
import type { CatalogService } from './catalogService.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CATEGORY_PATTERN = /^[\p{L}\p{N} '&_.-]{1,100}$/u;
const searchQuerySchema = z.object({ q: z.string().max(200).optional() });

export function productRoutes(catalog: CatalogService): Router {
  const router = Router();

  router.get('/products/featured', async (_req, res) => {
    res.json({ data: { products: await catalog.getFeaturedProducts() } });
  });

  router.get('/products', async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) throw Errors.validation('The search query is invalid.', [{ field: 'q', message: 'Provide a single search term of at most 200 characters.' }]);
    res.json({ data: { products: await catalog.listProducts(parsed.data.q) } });
  });

  router.get('/products/:productId', async (req, res) => {
    const { productId } = req.params;
    if (!ID_PATTERN.test(productId)) throw Errors.validation('The product identifier is malformed.', [{ field: 'productId', message: 'Invalid product identifier.' }]);
    res.json({ data: { product: await catalog.getProduct(productId) } });
  });

  router.get('/categories', async (_req, res) => {
    res.json({ data: { categories: await catalog.listCategories() } });
  });

  router.get('/categories/:categoryId/products', async (req, res) => {
    const { categoryId } = req.params;
    if (!CATEGORY_PATTERN.test(categoryId)) throw Errors.validation('The category identifier is malformed.', [{ field: 'categoryId', message: 'Invalid category identifier.' }]);
    res.json({ data: await catalog.getCategoryProducts(categoryId) });
  });

  return router;
}
