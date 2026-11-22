import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { ProductGrid } from './ProductGrid';
import { ErrorState, LoadingState } from './States';

export function FeaturedProducts() {
  const state = useAsync(api.featuredProducts, []);
  return (
    <section aria-labelledby="featured-heading">
      <h2 id="featured-heading">Featured products</h2>
      {state.status === 'loading' && <LoadingState label="Loading featured products…" />}
      {state.status === 'error' && <ErrorState title="Featured products are unavailable" error={state.error} onRetry={state.reload} />}
      {state.status === 'success' && <ProductGrid products={state.data} label="Featured products" />}
    </section>
  );
}
