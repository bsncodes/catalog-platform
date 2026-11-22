import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { categoriesRoute, mockApi, product } from './fixtures';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Home page', () => {
  it('renders the five backend-configured featured products and category navigation', async () => {
    const featured = ['1', '5', '9', '12', '18'].map((id) => product(id));
    const { calls } = mockApi({ ...categoriesRoute, 'GET /api/catalog/products/featured': () => ({ status: 200, body: { data: { products: featured } } }) });
    renderAt('/');
    const grid = await screen.findByRole('list', { name: 'Featured products' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(5);
    expect(within(grid).getByRole('link', { name: 'Product 12' })).toHaveAttribute('href', '/products/12');
    const nav = await screen.findByRole('navigation', { name: 'Categories' });
    expect(within(nav).getByRole('link', { name: "men's clothing" })).toHaveAttribute('href', "/categories/men's%20clothing");
    // Browser only talks to the public gateway path.
    expect(calls.every((c) => c.url.pathname.startsWith('/api/catalog/'))).toBe(true);
  });

  it('shows a meaningful error with retry when featured products fail', async () => {
    let attempts = 0;
    mockApi({
      ...categoriesRoute,
      'GET /api/catalog/products/featured': () =>
        ++attempts === 1
          ? { status: 503, body: { error: { code: 'PRODUCT_PROVIDER_UNAVAILABLE', message: 'The product catalogue is temporarily unavailable. Please retry.' } } }
          : { status: 200, body: { data: { products: [product('1')] } } },
    });
    renderAt('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Featured products are unavailable');
    expect(alert).toHaveTextContent('temporarily unavailable');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Product 1' })).toBeInTheDocument();
  });
});

describe('Category page', () => {
  it('renders top-rated and additional sections and a category enquiry form', async () => {
    mockApi({
      ...categoriesRoute,
      'GET /api/catalog/categories/electronics/products': () => ({
        status: 200,
        body: { data: { category: { id: 'electronics', name: 'electronics' }, topRated: ['1', '2', '3', '4', '5'].map((id) => product(id)), additionalProducts: [product('6')] } },
      }),
    });
    renderAt('/categories/electronics');
    expect(within(await screen.findByRole('list', { name: 'Top rated in electronics' })).getAllByRole('listitem')).toHaveLength(5);
    expect(within(screen.getByRole('list', { name: 'More in electronics' })).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Enquire' }));
    expect(screen.getByRole('heading', { name: 'Enquire about this category' })).toBeInTheDocument();
  });

  it('shows the not-found error for an unknown category', async () => {
    mockApi({ ...categoriesRoute, 'GET /api/catalog/categories/toys/products': () => ({ status: 404, body: { error: { code: 'CATEGORY_NOT_FOUND', message: 'The requested category does not exist.' } } }) });
    renderAt('/categories/toys');
    expect(await screen.findByRole('alert')).toHaveTextContent('The requested category does not exist.');
  });
});

describe('Search', () => {
  it('submits the search through the API and shows only returned matches', async () => {
    const { calls } = mockApi({ ...categoriesRoute, 'GET /api/catalog/products': (url) => ({ status: 200, body: { data: { products: url.searchParams.get('q') === 'ssd' ? [product('9', { title: 'Fast SSD' })] : [] } } }) });
    renderAt('/');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), '  ssd ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const results = await screen.findByRole('list', { name: 'Search results' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('1 product found')).toBeInTheDocument();
    expect(calls.some((c) => c.url.searchParams.get('q') === 'ssd')).toBe(true);
  });

  it('shows an empty state when nothing matches', async () => {
    mockApi({ ...categoriesRoute, 'GET /api/catalog/products': () => ({ status: 200, body: { data: { products: [] } } }) });
    renderAt('/search?q=zzz');
    expect(await screen.findByText('No products match your search')).toBeInTheDocument();
  });

  it('validates a blank search without calling the API', async () => {
    const { calls } = mockApi(categoriesRoute);
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(within(screen.getByRole('search')).getByRole('alert')).toHaveTextContent('Enter a search term.');
    expect(calls.some((c) => c.url.pathname === '/api/catalog/products')).toBe(false);
  });
});

describe('Product details page', () => {
  it('shows title, description, image, price, category, rating and review count', async () => {
    mockApi({ ...categoriesRoute, 'GET /api/catalog/products/3': () => ({ status: 200, body: { data: { product: product('3', { title: 'Cotton Jacket', price: { amount: 55.99, currency: 'USD' }, rating: { rate: 4.7, count: 500 } }) } } }) });
    renderAt('/products/3');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cotton Jacket' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cotton Jacket' })).toHaveAttribute('src', 'https://img.test/3.png');
    expect(screen.getByText('$55.99')).toBeInTheDocument();
    expect(screen.getByText('Description 3')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'electronics' })).toHaveAttribute('href', '/categories/electronics');
    expect(screen.getByRole('img', { name: 'Rated 4.7 out of 5 from 500 reviews' })).toBeInTheDocument();
  });

  it('shows an error for a missing product', async () => {
    mockApi({ ...categoriesRoute, 'GET /api/catalog/products/999': () => ({ status: 404, body: { error: { code: 'PRODUCT_NOT_FOUND', message: 'The requested product does not exist.' } } }) });
    renderAt('/products/999');
    expect(await screen.findByRole('alert')).toHaveTextContent('The requested product does not exist.');
  });
});
