import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'catalog-service' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Defence in depth: customer contact details must never reach general logs.
    redact: {
      paths: ['customer', '*.customer', 'email', '*.email', 'phone', '*.phone', 'authorization', '*.authorization'],
      censor: '[REDACTED]',
    },
  });
}
