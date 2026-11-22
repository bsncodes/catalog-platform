import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';
import { ProductGrid } from '../components/ProductGrid';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const state = useAsync(() => (query ? api.searchProducts(query) : Promise.resolve([])), [query]);

  if (!query) return <EmptyState title="Enter a search term">Use the search box above to find products by name, description or category.</EmptyState>;
  if (state.status === 'loading') return <LoadingState label="Searching…" />;
  if (state.status === 'error') return <ErrorState title="Search failed" error={state.error} onRetry={state.reload} />;

  return (
    <>
      <h1 className="page-title">Results for “{query}”</h1>
      {state.data.length === 0 ? (
        <EmptyState title="No products match your search">Try a different word, or browse a category.</EmptyState>
      ) : (
        <>
          <p className="muted" aria-live="polite">
            {state.data.length} {state.data.length === 1 ? 'product' : 'products'} found
          </p>
          <ProductGrid products={state.data} label="Search results" />
        </>
      )}
    </>
  );
}
