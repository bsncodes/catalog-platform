import { z } from 'zod';
import type { Product } from '@catalog/contracts';
import { ProviderError } from '../errors.js';
import type { ProductProvider } from './provider.js';
import { fakeStoreProductSchema, toProduct } from './fakeStoreMapper.js';

export interface FakeStoreProviderOptions {
  baseUrl: string;
  timeoutMs: number;
  currency: string;
  fetchImpl?: typeof fetch;
}

const NUMERIC_ID = /^[1-9][0-9]{0,9}$/;

/** Fake Store API adapter. All upstream shapes are validated and normalized here. */
export class FakeStoreProvider implements ProductProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: FakeStoreProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listProducts(): Promise<Product[]> {
    const body = await this.request('/products');
    const parsed = z.array(fakeStoreProductSchema).safeParse(body);
    if (!parsed.success) {
      throw new ProviderError('INVALID_RESPONSE', 'Fake Store product list failed validation.', { cause: parsed.error });
    }
    return parsed.data.map((raw) => toProduct(raw, this.options.currency));
  }

  async getProduct(id: string): Promise<Product | null> {
    // Fake Store identifiers are positive integers; anything else cannot exist upstream.
    if (!NUMERIC_ID.test(id)) return null;
    const body = await this.request(`/products/${id}`);
    // Fake Store answers an unknown id with 200 and an empty body / null.
    if (body === null || body === undefined || body === '') return null;
    const parsed = fakeStoreProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError('INVALID_RESPONSE', 'Fake Store product failed validation.', { cause: parsed.error });
    }
    return toProduct(parsed.data, this.options.currency);
  }

  private async request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new ProviderError('TIMEOUT', `Fake Store request timed out after ${this.options.timeoutMs}ms.`, { cause: error });
      }
      throw new ProviderError('UNAVAILABLE', 'Fake Store request failed.', { cause: error });
    }

    if (response.status === 404) return null;
    if (response.status >= 500 || response.status === 429) {
      throw new ProviderError('UNAVAILABLE', `Fake Store responded with HTTP ${response.status}.`);
    }
    if (!response.ok) {
      throw new ProviderError('INVALID_RESPONSE', `Fake Store responded with HTTP ${response.status}.`);
    }

    const text = await response.text();
    if (text.trim().length === 0) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new ProviderError('INVALID_RESPONSE', 'Fake Store returned malformed JSON.', { cause: error });
    }
  }
}
