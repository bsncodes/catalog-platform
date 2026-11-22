import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { EnquiryForm } from '../components/EnquiryForm';
import { ErrorState, LoadingState } from '../components/States';
import { Rating } from '../components/Rating';
import { formatPrice } from '../components/format';

export function ProductPage() {
  const { productId = '' } = useParams();
  const state = useAsync(() => api.product(productId), [productId]);

  if (state.status === 'loading') return <LoadingState label="Loading product…" />;
  if (state.status === 'error') return <ErrorState title="This product could not be loaded" error={state.error} onRetry={state.reload} />;

  const product = state.data;
  return (
    <>
      <article className="product">
        <div className="product__image">
          <img src={product.imageUrl} alt={product.title} />
        </div>
        <div className="product__info">
          <h1>{product.title}</h1>
          <p>
            <Link to={`/categories/${encodeURIComponent(product.category)}`} className="tag">
              {product.category}
            </Link>
          </p>
          <p className="price price--large">{formatPrice(product.price)}</p>
          <p>
            <Rating rating={product.rating} showCount />
          </p>
          <p className="product__description">{product.description}</p>
        </div>
      </article>
      <EnquiryForm key={product.id} entityType="PRODUCT" entityId={product.id} entityName={product.title} />
    </>
  );
}
