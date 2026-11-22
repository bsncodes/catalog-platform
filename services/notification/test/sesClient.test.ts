import { describe, expect, it } from 'vitest';
import { createSesClient } from '../src/email/sesClient.js';

describe('createSesClient (RV3-01)', () => {
  it('configures a finite, enforced request timeout and bounded retries', async () => {
    const client = createSesClient({ region: 'eu-west-1', requestTimeoutMs: 1234 });
    const handlerConfig = await (client.config.requestHandler as unknown as { configProvider: Promise<Record<string, unknown>> }).configProvider;
    expect(handlerConfig).toMatchObject({ requestTimeout: 1234, throwOnRequestTimeout: true, connectionTimeout: 2000 });
    expect(await client.config.maxAttempts()).toBe(2);
    client.destroy();
  });
});
