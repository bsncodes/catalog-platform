import { SESv2Client } from '@aws-sdk/client-sesv2';

/**
 * SES client with enforced timeouts (RV3-01). Without throwOnRequestTimeout the Smithy handler only
 * warns, and a hung send could outlive the email lease and SQS visibility timeout, causing a resend.
 */
export function createSesClient(options: { region: string; requestTimeoutMs: number }): SESv2Client {
  return new SESv2Client({
    region: options.region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: options.requestTimeoutMs,
      socketTimeout: options.requestTimeoutMs,
      throwOnRequestTimeout: true,
    },
    maxAttempts: 2,
  });
}
