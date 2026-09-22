import { defineConfig } from '@playwright/test';

/**
 * Authorization matrix — API-level, no browser.
 *
 * Run order:
 *   docker compose -f ../docker-compose.test.yml up -d
 *   cd ../QaDocBackend
 *   $env:DATABASE_URL = 'postgresql://qadoc:qadoc@localhost:55432/qadoc_test'
 *   dotnet run
 *   cd ../QaDocFrontend && npm run authz
 *
 * This suite CREATES users, projects, folders and tickets. actors.ts refuses to run
 * against anything that is not localhost, and that guard is the only thing standing
 * between a stray QADOC_API and a mess in someone's real database. Leave it there.
 */
export default defineConfig({
  testDir: './e2e/authz',

  // Serial and single-worker: the cast and fixtures are built once in beforeAll and
  // shared, and several cases mutate the same project.
  fullyParallel: false,
  workers: 1,

  // A permission test that "passes on retry" is a test that is lying. Either the rule
  // holds or it does not.
  retries: 0,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-authz' }]],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  // No `use.baseURL` and no browser: every request goes through APIRequestContext,
  // built in actors.ts against QADOC_API.
  use: {},
});
