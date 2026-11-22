import { Link } from 'react-router-dom';
import type { Product } from '@catalog/contracts';
import { Rating } from './Rating';
import { formatPrice } from './format';

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card">
      <Link to={`/products/${encodeURIComponent(product.id)}`} className="card__link">
        <div className="card__image">
          <img src={product.imageUrl} alt="" loading="lazy" />
        </div>
        <h3 className="card__title">{product.title}</h3>
      </Link>
      <p className="card__category">{product.category}</p>
      <div className="card__meta">
        <span className="price">{formatPrice(product.price)}</span>
        <Rating rating={product.rating} />
      </div>
    </article>
  );
}
