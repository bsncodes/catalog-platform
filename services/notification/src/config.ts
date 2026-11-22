import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    HEALTH_PORT: z.coerce.number().int().positive().default(3002),
    DATABASE_URL: z.string().min(1),
    SQS_ENDPOINT: z.string().url().optional(),
    SQS_REGION: z.string().default('eu-west-1'),
    SQS_QUEUE_NAME: z.string().min(1).default('catalog-enquiry-events'),
    SQS_WAIT_TIME_SECONDS: z.coerce.number().int().min(0).max(20).default(20),
    SQS_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().min(5).default(60),
    SQS_MAX_RECEIVE_COUNT: z.coerce.number().int().positive().default(5),
    CONSUMER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(5),
    EMAIL_PROVIDER: z.enum(['smtp', 'ses']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SES_REGION: z.string().default('eu-west-1'),
    EMAIL_FROM: z.string().email(),
    SALES_RECIPIENT_PRODUCT: z.string().email(),
    SALES_RECIPIENT_CATEGORY: z.string().email(),
    EMAIL_RETRY_BASE_SECONDS: z.coerce.number().int().positive().default(5),
    CATALOG_INTERNAL_URL: z.string().url(),
    INTERNAL_API_TOKEN: z.string().min(16, 'INTERNAL_API_TOKEN must be at least 16 characters.'),
    CALLBACK_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    CALLBACK_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    CALLBACK_RETRY_BASE_MS: z.coerce.number().int().positive().default(2000),
    CALLBACK_RETRY_MAX_MS: z.coerce.number().int().positive().default(300000),
    CALLBACK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(50),
    BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
    BREAKER_OPEN_MS: z.coerce.number().int().positive().default(30000),
    BREAKER_HALF_OPEN_PROBES: z.coerce.number().int().positive().default(1),
  });

export type NotificationConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): NotificationConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid Notification Service configuration: ${issues}`);
  }
  return result.data;
}
