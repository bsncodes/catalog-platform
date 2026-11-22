import { defineConfig } from 'vitest/config';

// Integration tests: real PostgreSQL + ElasticMQ from docker compose; files share one DB, so run serially.
export default defineConfig({
  test: { environment: 'node', include: ['test/integration/**/*.test.ts'], fileParallelism: false, testTimeout: 15000 },
});
