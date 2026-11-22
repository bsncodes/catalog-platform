import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../src/callback/circuitBreaker.js';

const healthFailure = new Error('5xx');
const businessFailure = new Error('404');
const isHealth = (error: unknown) => error === healthFailure;

function setup() {
  let now = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 3, openDurationMs: 1000, halfOpenMaxProbes: 1, now: () => now });
  return { breaker, advance: (ms: number) => (now += ms) };
}

const fail = (breaker: CircuitBreaker, error = healthFailure) => breaker.execute(() => Promise.reject(error), isHealth).catch((e: unknown) => e);

describe('CircuitBreaker', () => {
  it('CLOSED: passes calls through and stays closed below the threshold', async () => {
    const { breaker } = setup();
    await fail(breaker);
    await fail(breaker);
    expect(breaker.getState()).toBe('CLOSED');
    expect(await breaker.execute(async () => 'ok', isHealth)).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('does not count business errors (400/404) as health failures', async () => {
    const { breaker } = setup();
    for (let i = 0; i < 5; i += 1) await fail(breaker, businessFailure);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('OPEN: opens after consecutive failures and fails fast without calling the dependency', async () => {
    const { breaker } = setup();
    for (let i = 0; i < 3; i += 1) await fail(breaker);
    expect(breaker.getState()).toBe('OPEN');
    let called = false;
    const error = await breaker.execute(async () => (called = true), isHealth).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it('HALF_OPEN: allows one probe after the open duration and closes on success', async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await fail(breaker);
    advance(1000);
    expect(breaker.getState()).toBe('HALF_OPEN');
    expect(await breaker.execute(async () => 'recovered', isHealth)).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN: reopens when the probe fails', async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await fail(breaker);
    advance(1000);
    await fail(breaker);
    expect(breaker.getState()).toBe('OPEN');
  });

  it('HALF_OPEN: rejects concurrent calls beyond the probe limit', async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await fail(breaker);
    advance(1000);
    let release: () => void = () => undefined;
    const probe = breaker.execute(() => new Promise<string>((resolve) => (release = () => resolve('ok'))), isHealth);
    const second = await breaker.execute(async () => 'x', isHealth).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(CircuitOpenError);
    release();
    expect(await probe).toBe('ok');
  });
});
