import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { ProductGrid } from '../components/ProductGrid';
import { EnquiryForm } from '../components/EnquiryForm';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

export function CategoryPage() {
  const { categoryId = '' } = useParams();
  const state = useAsync(() => api.categoryProducts(categoryId), [categoryId]);

  if (state.status === 'loading') return <LoadingState label="Loading category…" />;
  if (state.status === 'error') return <ErrorState title="This category could not be loaded" error={state.error} onRetry={state.reload} />;

  const { category, topRated, additionalProducts } = state.data;
  return (
    <>
      <h1 className="page-title">{category.name}</h1>
      <section aria-labelledby="top-rated-heading">
        <h2 id="top-rated-heading">Top rated</h2>
        <ProductGrid products={topRated} label={`Top rated in ${category.name}`} />
      </section>
      <section aria-labelledby="more-heading">
        <h2 id="more-heading">More in {category.name}</h2>
        {additionalProducts.length > 0 ? (
          <ProductGrid products={additionalProducts} label={`More in ${category.name}`} />
        ) : (
          <EmptyState title="No additional products">All products in this category are shown above.</EmptyState>
        )}
      </section>
      <EnquiryForm key={category.id} entityType="CATEGORY" entityId={category.id} entityName={category.name} />
    </>
  );
}
