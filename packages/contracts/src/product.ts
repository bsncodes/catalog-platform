/** Normalized product contract exposed by the public Catalog API. Provider-agnostic. */
export interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  price: { amount: number; currency: string };
  rating: { rate: number; count: number } | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface CategoryProducts {
  category: Category;
  topRated: Product[];
  additionalProducts: Product[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ field: string; message: string }>;
  };
}
