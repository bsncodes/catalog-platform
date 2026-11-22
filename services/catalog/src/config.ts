import { z } from 'zod';

const csvIds = z
  .string()
  .transform((value) => value.split(',').map((id) => id.trim()).filter((id) => id.length > 0))
  .refine((ids) => ids.length === 5, 'FEATURED_PRODUCT_IDS must contain exactly five product ids.')
  .refine((ids) => new Set(ids).size === ids.length, 'FEATURED_PRODUCT_IDS must not contain duplicates.');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_PORT: z.coerce.number().int().positive().default(3000),
  INTERNAL_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  PRODUCT_PROVIDER: z.enum(['fakestore', 'fixture']).default('fakestore'),
  FAKESTORE_BASE_URL: z.string().url().default('https://fakestoreapi.com'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PRODUCT_CURRENCY: z.string().length(3).default('USD'),
  FEATURED_PRODUCT_IDS: csvIds.default(['1', '5', '9', '12', '18']),
  INTERNAL_API_TOKEN: z.string().min(16, 'INTERNAL_API_TOKEN must be at least 16 characters.'),
  SQS_ENDPOINT: z.string().url().optional(),
  SQS_REGION: z.string().default('eu-west-1'),
  SQS_QUEUE_NAME: z.string().min(1).default('catalog-enquiry-events'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(10),
  OUTBOX_CLAIM_LEASE_MS: z.coerce.number().int().positive().default(180000),
  SQS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ENQUIRY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  ENQUIRY_STATUS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

export type CatalogConfig = z.infer<typeof configSchema>;

/** Lease must outlive a full batch of bounded SQS sends so a live publisher never loses its claim. */
function validateLease(config: CatalogConfig): string | undefined {
  const worstCaseBatchMs = config.OUTBOX_BATCH_SIZE * config.SQS_REQUEST_TIMEOUT_MS * 3;
  return config.OUTBOX_CLAIM_LEASE_MS > worstCaseBatchMs
    ? undefined
    : `OUTBOX_CLAIM_LEASE_MS (${config.OUTBOX_CLAIM_LEASE_MS}) must exceed OUTBOX_BATCH_SIZE x SQS_REQUEST_TIMEOUT_MS x 3 (${worstCaseBatchMs}).`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CatalogConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid Catalog Service configuration: ${issues}`);
  }
  const leaseError = validateLease(result.data);
  if (leaseError) throw new Error(`Invalid Catalog Service configuration: ${leaseError}`);
  return result.data;
}
