import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (Playwright): produkcioni build (`npx ng build`) sa statičkog servera i mokovan API (`e2e/mock-api.ts`), bez
 * backenda. Lokalno: `npm run e2e` (build + provera tipova + testovi). CI: korak posle produkcionog builda.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4300);
const CI = !!process.env['CI'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // bez ponavljanja: nestabilan test mora da se vidi, ne da prođe iz drugog pokušaja
  retries: 0,
  workers: CI ? 2 : 3,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'sr-Latn-RS',
    timezoneId: 'Europe/Belgrade',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/staticki-server.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
});
