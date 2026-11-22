import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

/** Reads a single value from a service database via the compose postgres container (test-only access). */
export function sql(database: 'catalog' | 'notification', query: string): string {
  // Compose interpolates docker-compose.yml even for `exec`; fall back to .env.example so the suite
  // also works from a checkout without a local .env (RV5-06).
  const envFile = existsSync('.env') ? '.env' : '.env.example';
  return execFileSync('docker', ['compose', '--env-file', envFile, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', database, '-tAc', query], { encoding: 'utf8' }).trim();
}

export async function poll<T>(read: () => T | Promise<T>, done: (value: T) => boolean, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    value = await read();
  }
  return value;
}

export interface MailpitSummary {
  messages_count: number;
  messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
}

export async function searchMailpit(query: string): Promise<MailpitSummary> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  return (await response.json()) as MailpitSummary;
}

export async function mailpitMessageText(id: string): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  const body = (await response.json()) as { Text: string };
  return body.Text;
}
