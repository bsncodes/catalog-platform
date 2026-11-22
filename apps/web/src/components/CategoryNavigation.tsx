import { NavLink } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../api/useAsync';

export function CategoryNavigation() {
  const state = useAsync(api.categories, []);
  return (
    <nav aria-label="Categories" className="categories">
      {state.status === 'loading' && <span className="muted">Loading categories…</span>}
      {state.status === 'error' && (
        <span className="muted" role="alert">
          Categories unavailable.{' '}
          <button type="button" className="link-button" onClick={state.reload}>
            Retry
          </button>
        </span>
      )}
      {state.status === 'success' && (
        <ul>
          {state.data.map((category) => (
            <li key={category.id}>
              <NavLink to={`/categories/${encodeURIComponent(category.id)}`}>{category.name}</NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
