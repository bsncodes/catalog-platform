/** Exponential backoff with jitter: uniformly in [ceiling/2, ceiling], ceiling = min(max, base * 2^(attempt-1)). */
export function backoffWithJitter(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
