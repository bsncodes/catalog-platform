import type { ApiErrorBody, Category, CategoryProducts, EnquiryAcceptedResponse, EnquiryRequestInput, Product } from '@catalog/contracts';

/** Single configurable public API base path; the browser only ever talks to the Gateway. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/catalog';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach the catalogue. Check your connection and try again.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN_ERROR', error?.message ?? 'Something went wrong. Please try again.', error?.details ?? []);
  }
  return body as T;
}

export const api = {
  featuredProducts: () => request<{ data: { products: Product[] } }>('/products/featured').then((r) => r.data.products),
  searchProducts: (q: string) => request<{ data: { products: Product[] } }>(`/products?q=${encodeURIComponent(q)}`).then((r) => r.data.products),
  product: (id: string) => request<{ data: { product: Product } }>(`/products/${encodeURIComponent(id)}`).then((r) => r.data.product),
  categories: () => request<{ data: { categories: Category[] } }>('/categories').then((r) => r.data.categories),
  categoryProducts: (id: string) => request<{ data: CategoryProducts }>(`/categories/${encodeURIComponent(id)}/products`).then((r) => r.data),
  submitEnquiry: (enquiry: EnquiryRequestInput) => request<EnquiryAcceptedResponse>('/enquiries', { method: 'POST', body: JSON.stringify(enquiry) }),
};
