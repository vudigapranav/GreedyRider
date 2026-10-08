import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  expect: { timeout: 7000 }, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined),
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm run dev:api', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: !process.env.CI, timeout: 15000 },
    { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 15000 },
  ],
});
