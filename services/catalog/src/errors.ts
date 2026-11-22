export interface ErrorDetail {
  field: string;
  message: string;
}

/** Application error carrying a stable public error code and HTTP status. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (message: string, details?: ErrorDetail[]) => new AppError(400, 'VALIDATION_ERROR', message, details),
  unprocessable: (message: string, details?: ErrorDetail[]) => new AppError(422, 'VALIDATION_ERROR', message, details),
  notFound: (code: string, message: string) => new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'),
  databaseUnavailable: (cause: unknown) =>
    new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unable to store data. Please retry.', undefined, { cause }),
  databaseReadUnavailable: (cause: unknown) =>
    new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unable to read data. Please retry.', undefined, { cause }),
};

/** Errors raised at the product-provider boundary. Mapped to 502/503/504 by the HTTP layer. */
export type ProviderFailureKind = 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'TIMEOUT';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailureKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export function providerErrorToAppError(error: ProviderError): AppError {
  switch (error.kind) {
    case 'TIMEOUT':
      return new AppError(504, 'PRODUCT_PROVIDER_TIMEOUT', 'The product catalogue did not respond in time. Please retry.');
    case 'INVALID_RESPONSE':
      return new AppError(502, 'PRODUCT_PROVIDER_INVALID_RESPONSE', 'The product catalogue returned an unusable response.');
    case 'UNAVAILABLE':
      return new AppError(503, 'PRODUCT_PROVIDER_UNAVAILABLE', 'The product catalogue is temporarily unavailable. Please retry.');
  }
}
