import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against the DEPLOYED app. Read-only by construction — see the write
 * guard in e2e/smoke/production.spec.ts.
 *
 *   npm run smoke
 *   $env:QADOC_URL = 'https://staging...'; npm run smoke     # somewhere else
 *
 * Deliberately NOT part of `npm run e2e`: that suite mocks the API and runs against
 * localhost. This one touches the real thing.
 */
export default defineConfig({
  testDir: './e2e/smoke',

  // One worker, serial. This is someone's live system, not a load target.
  fullyParallel: false,
  workers: 1,

  // Production flakes for reasons that are not bugs: cold starts, transient network.
  // Retry before crying wolf, but keep the trace from the first failure.
  retries: 2,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-smoke' }]],

  // Railway can cold-start the API, and the Worker may cold-start too. The first
  // request of a run is routinely 10-20s slower than every one after it.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: process.env.QADOC_URL ?? 'https://qadocfrontend.belal-mhd-arksousi.workers.dev',
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // No webServer: the app under test is already running, somewhere else.
});
