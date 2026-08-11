import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes E2E (Playwright) rodam via `pnpm test:e2e`, não pelo vitest.
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
  },
});
