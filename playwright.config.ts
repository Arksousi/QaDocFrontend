import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for QaDoc.
 *
 * Point the run somewhere else with QADOC_BASE_URL, e.g.
 *   $env:QADOC_BASE_URL = 'https://qadoc.example.com'; npx playwright test
 */
export default defineConfig({
  testDir: './e2e',

  // The smoke suite runs against the deployed app with its own config, and must never
  // be picked up by a local run that starts ng serve and mocks the API.
  testIgnore: '**/smoke/**',

  // Each spec file gets its own worker. Safe here because every test is read-only;
  // the moment a test writes data, revisit this.
  fullyParallel: true,

  // A stray test.only should fail the build rather than silently skip everything else.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.QADOC_BASE_URL ?? 'http://localhost:4200',

    // A trace is a full recording — DOM snapshots, network, console — that you scrub
    // through in a viewer. Only kept when a retry happens, so passing runs cost nothing.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Starts `ng serve` for you and waits for it. reuseExistingServer means a dev server
  // you already have running is left alone instead of fighting over port 4200.
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
