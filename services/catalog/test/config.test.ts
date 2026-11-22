import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { DATABASE_URL: 'postgres://x', INTERNAL_API_TOKEN: 'a-sufficiently-long-token' };

describe('loadConfig', () => {
  it('accepts defaults (lease exceeds worst-case bounded SQS batch)', () => {
    const config = loadConfig(base);
    expect(config.FEATURED_PRODUCT_IDS).toHaveLength(5);
    expect(config.OUTBOX_CLAIM_LEASE_MS).toBeGreaterThan(config.OUTBOX_BATCH_SIZE * config.SQS_REQUEST_TIMEOUT_MS * 3);
  });

  it('rejects an outbox lease shorter than the bounded publish time (RV2-02)', () => {
    expect(() => loadConfig({ ...base, OUTBOX_CLAIM_LEASE_MS: '10000' })).toThrow(/OUTBOX_CLAIM_LEASE_MS/);
  });

  it('requires exactly five distinct featured ids', () => {
    expect(() => loadConfig({ ...base, FEATURED_PRODUCT_IDS: '1,2,3,4' })).toThrow(/exactly five/);
    expect(() => loadConfig({ ...base, FEATURED_PRODUCT_IDS: '1,1,2,3,4' })).toThrow(/duplicates/);
  });

  it('rejects a short internal token', () => {
    expect(() => loadConfig({ ...base, INTERNAL_API_TOKEN: 'short' })).toThrow(/INTERNAL_API_TOKEN/);
  });
});
