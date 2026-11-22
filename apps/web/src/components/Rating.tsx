import type { Product } from '@catalog/contracts';

export function Rating({ rating, showCount = false }: { rating: Product['rating']; showCount?: boolean }) {
  if (!rating) return <span className="rating rating--none">No ratings yet</span>;
  return (
    <span className="rating" role="img" aria-label={`Rated ${rating.rate} out of 5${showCount ? ` from ${rating.count} reviews` : ''}`}>
      <span aria-hidden="true">★ {rating.rate.toFixed(1)}</span>
      {showCount && <span aria-hidden="true" className="rating__count"> ({rating.count} reviews)</span>}
    </span>
  );
}
