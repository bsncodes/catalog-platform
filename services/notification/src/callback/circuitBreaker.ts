export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  openDurationMs: number;
  halfOpenMaxProbes: number;
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Circuit breaker is open; call not attempted.');
    this.name = 'CircuitOpenError';
  }
}

/**
 * Minimal three-state circuit breaker around a single HTTP dependency.
 * Only errors classified as health failures (network, timeout, 5xx) count toward opening.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private probesInFlight = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.options.openDurationMs) {
      this.state = 'HALF_OPEN';
      this.probesInFlight = 0;
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>, isHealthFailure: (error: unknown) => boolean): Promise<T> {
    const state = this.getState();
    if (state === 'OPEN') throw new CircuitOpenError(this.remainingOpenMs());
    if (state === 'HALF_OPEN') {
      if (this.probesInFlight >= this.options.halfOpenMaxProbes) throw new CircuitOpenError(this.options.openDurationMs);
      this.probesInFlight += 1;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (isHealthFailure(error)) this.onFailure();
      else this.onSuccess(); // the dependency answered; a business rejection is not a health failure
      throw error;
    } finally {
      if (state === 'HALF_OPEN') this.probesInFlight = Math.max(0, this.probesInFlight - 1);
    }
  }

  private remainingOpenMs(): number {
    return Math.max(0, this.options.openDurationMs - (this.now() - this.openedAt));
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = this.now();
    }
  }
}
