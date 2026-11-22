import type { Product } from '@catalog/contracts';

export function formatPrice(price: Product['price']): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.amount);
}
