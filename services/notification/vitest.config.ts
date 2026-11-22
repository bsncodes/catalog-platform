import { configDefaults, defineConfig } from 'vitest/config';

// Unit/API tests: no external dependencies.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'], exclude: [...configDefaults.exclude, 'test/integration/**'] },
});
