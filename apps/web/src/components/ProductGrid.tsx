import type { Product } from '@catalog/contracts';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products, label }: { products: Product[]; label: string }) {
  return (
    <ul className="grid" aria-label={label}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
