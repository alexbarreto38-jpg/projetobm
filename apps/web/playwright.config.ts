import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do painel. Executa contra uma stack já em execução (API + web + Postgres +
 * Redis). Rode com `pnpm test:e2e` após subir os serviços; não faz parte do
 * `pnpm test` padrão para não depender da orquestração completa no CI unitário.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    // Usa o Chromium pré-instalado do ambiente (evita download de browser).
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
