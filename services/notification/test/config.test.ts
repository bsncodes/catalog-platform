import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgres://x',
  EMAIL_FROM: 'from@example.com',
  SALES_RECIPIENT_PRODUCT: 'p@example.com',
  SALES_RECIPIENT_CATEGORY: 'c@example.com',
  CATALOG_INTERNAL_URL: 'http://catalog:3001',
  INTERNAL_API_TOKEN: 'a-sufficiently-long-token',
};

describe('loadConfig', () => {
  it('accepts defaults: bounded email budget fits inside the email lease', () => {
    const config = loadConfig(base);
    expect(config.EMAIL_SEND_TIMEOUT_MS * 2 + config.CALLBACK_TIMEOUT_MS).toBeLessThan(Math.min(config.SQS_VISIBILITY_TIMEOUT_SECONDS * 1000, 60_000));
  });

  it('rejects an email timeout that could outlive the lease (RV3-01)', () => {
    expect(() => loadConfig({ ...base, EMAIL_SEND_TIMEOUT_MS: '30000' })).toThrow(/email lease/);
    expect(() => loadConfig({ ...base, SQS_VISIBILITY_TIMEOUT_SECONDS: '20' })).toThrow(/email lease/);
  });

  it('requires trusted recipients to be valid email addresses', () => {
    expect(() => loadConfig({ ...base, SALES_RECIPIENT_PRODUCT: 'not-an-email' })).toThrow(/SALES_RECIPIENT_PRODUCT/);
  });
});
