import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function SearchBar() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a search term.');
      return;
    }
    setError(null);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form role="search" className="search" onSubmit={onSubmit} noValidate>
      <label htmlFor="search-input" className="visually-hidden">
        Search products
      </label>
      <input
        id="search-input"
        type="search"
        placeholder="Search products…"
        value={query}
        maxLength={200}
        onChange={(e) => setQuery(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'search-error' : undefined}
      />
      <button type="submit" className="button">
        Search
      </button>
      {error && (
        <span id="search-error" className="field-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
