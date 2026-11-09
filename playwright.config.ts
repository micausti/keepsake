import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests: the real production build in a real browser, on an emulated
 * iPhone. They catch what jsdom unit tests can't (crashes, CSP violations,
 * service worker, canvas photo processing). Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  use: {
    ...devices['iPhone 13'],
    // iPhone emulation uses WebKit by default; we run Chromium (installed in CI).
    browserName: 'chromium',
    baseURL: 'http://localhost:4173/keepsake/',
    trace: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/keepsake/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
