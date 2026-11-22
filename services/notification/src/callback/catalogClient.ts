import { notificationStatusCallbackResponseSchema, type NotificationStatusCallback, type NotificationStatusCallbackResponse } from '@catalog/contracts';

/** Failure calling Catalog Service. `retryable` drives callback retry; `healthFailure` drives the circuit breaker. */
export class CatalogCallbackError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly healthFailure: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CatalogCallbackError';
  }
}

export interface CatalogClient {
  reportNotificationSent(enquiryId: string, payload: NotificationStatusCallback, correlationId?: string): Promise<NotificationStatusCallbackResponse>;
}

/** HTTP client for Catalog Service's private callback API. */
export class HttpCatalogClient implements CatalogClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: { baseUrl: string; token: string; timeoutMs: number; fetchImpl?: typeof fetch }) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async reportNotificationSent(enquiryId: string, payload: NotificationStatusCallback, correlationId?: string): Promise<NotificationStatusCallbackResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/internal/catalog/enquiries/${encodeURIComponent(enquiryId)}/notification-status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.token}`,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new CatalogCallbackError(timedOut ? 'Catalog callback timed out' : 'Catalog callback network failure', true, true);
    }

    if (response.ok) {
      const parsed = notificationStatusCallbackResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new CatalogCallbackError('Catalog callback returned an unexpected body', true, false, response.status);
      return parsed.data;
    }
    if (response.status >= 500 || response.status === 429) {
      throw new CatalogCallbackError(`Catalog callback failed with HTTP ${response.status}`, true, true, response.status);
    }
    if (response.status === 401 || response.status === 403) {
      // Misconfiguration (token); retry so a fixed deployment can complete it, but do not trip the breaker.
      throw new CatalogCallbackError(`Catalog callback rejected credentials (HTTP ${response.status})`, true, false, response.status);
    }
    // 400/404/409: the request can never succeed as-is.
    throw new CatalogCallbackError(`Catalog callback rejected (HTTP ${response.status})`, false, false, response.status);
  }
}
