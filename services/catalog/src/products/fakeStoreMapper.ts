import { z } from 'zod';
import type { Product } from '@catalog/contracts';

/** Fake Store API product shape. Kept private to the provider boundary. */
export const fakeStoreProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string(),
  category: z.string().min(1),
  image: z.string().url(),
  rating: z
    .object({
      rate: z.number().min(0).max(5),
      count: z.number().int().nonnegative(),
    })
    .optional()
    .nullable(),
});

export type FakeStoreProduct = z.infer<typeof fakeStoreProductSchema>;

export function toProduct(raw: FakeStoreProduct, currency: string): Product {
  return {
    id: String(raw.id),
    title: raw.title.trim(),
    description: raw.description.trim(),
    category: raw.category.trim().toLowerCase(),
    imageUrl: raw.image,
    price: { amount: raw.price, currency },
    rating: raw.rating ? { rate: raw.rating.rate, count: raw.rating.count } : null,
  };
}
