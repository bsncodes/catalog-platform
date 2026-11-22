import { Link, Route, Routes } from 'react-router-dom';
import { CategoryNavigation } from './components/CategoryNavigation';
import { SearchBar } from './components/SearchBar';
import { EmptyState } from './components/States';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { ProductPage } from './pages/ProductPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="brand">
            Catalog
          </Link>
          <SearchBar />
        </div>
        <div className="container">
          <CategoryNavigation />
        </div>
      </header>
      <main id="main" className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/categories/:categoryId" element={<CategoryPage />} />
          <Route path="/products/:productId" element={<ProductPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<EmptyState title="Page not found"><Link to="/">Back to the homepage</Link></EmptyState>} />
        </Routes>
      </main>
    </>
  );
}
