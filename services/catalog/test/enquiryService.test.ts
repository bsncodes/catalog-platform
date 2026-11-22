import { describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import { EnquiryService } from '../src/enquiries/enquiryService.js';
import { CatalogService } from '../src/products/catalogService.js';
import { FEATURED, fixtureProvider } from './helpers.js';

describe('EnquiryService.getEnquiryStatus (RV6-03)', () => {
  it('maps a database error to 503 DATABASE_UNAVAILABLE with the read wording', async () => {
    const failingPool = { query: () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as Pool;
    const service = new EnquiryService(failingPool, new CatalogService(fixtureProvider(), FEATURED));
    await expect(service.getEnquiryStatus('6f1c1f5e-2f0a-4b8b-9b8e-7f8a1f6c1a11')).rejects.toMatchObject({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The service is temporarily unable to read data. Please retry.',
    });
  });
});
