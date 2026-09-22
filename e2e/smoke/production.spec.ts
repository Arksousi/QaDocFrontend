import { Page, expect, test } from '@playwright/test';

/**
 * Smoke tests against the deployed app and the real Railway API.
 *
 * Rules for everything in this file:
 *
 *  1. READ ONLY. No ticket is created, edited or deleted, no project is touched, no
 *     password is changed. The guard below enforces this at the network layer rather
 *     than trusting the tests to behave.
 *  2. GUEST ONLY. No credentials live in this repo, in CI, or in an env var. The guest
 *     tour needs no account, the API refuses every write for it, and — per the spec —
 *     it is also the only identity with sample data to look at. A signed-in account
 *     currently opens an empty Projects page.
 *  3. ASSERT SHAPE, NOT CONTENT. Production data changes without warning. "At least one
 *     project is listed" survives someone adding a project; "3 projects" does not.
 */

/** Requests that are allowed to leave the browser. Everything else is a bug in the test. */
const ALLOWED_WRITES = ['/auth/guest'];

/**
 * Hard safety rail. Aborts any non-GET request that is not an explicitly allowed
 * sign-in call, and records it so the test fails loudly instead of quietly mutating
 * production. This is the difference between "we intended it to be read-only" and
 * "it cannot write".
 */
async function blockWrites(page: Page) {
  const attempted: string[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'GET' || method === 'OPTIONS') return route.continue();
    if (ALLOWED_WRITES.some((path) => request.url().includes(path))) return route.continue();

    attempted.push(`${method} ${request.url()}`);
    return route.abort();
  });

  return { attempted };
}

/**
 * Opens the first project from the "All projects" table.
 *
 * Clicks the project-name link rather than the row: a row click lands on whatever cell
 * sits at its centre, and the actions cell stops propagation, so the link is the only
 * deterministic target. Both routes reach the same place.
 */
async function openFirstProject(page: Page) {
  await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
  await page.locator('table.table tbody tr').first().getByRole('link').first().click();
}

test.describe('Deployed app — read-only smoke', () => {
  test('the app boots and serves the sign-in page', async ({ page }) => {
    await blockWrites(page);

    const response = await page.goto('/');
    expect(response?.status(), 'the Worker should serve the app').toBeLessThan(400);

    // Signed out, authGuard bounces every route to /login.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue as a guest' })).toBeEnabled();
  });

  test('the API is reachable and answers the setup check', async ({ page }) => {
    await blockWrites(page);

    // If Railway is asleep or down, this is the request that shows it — and it is the
    // one the login page blocks on, so a failure here explains a permanent "Loading…".
    const status = page.waitForResponse(
      (r) => r.url().includes('/auth/status') && r.request().method() === 'GET',
    );
    await page.goto('/login');

    expect((await status).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('the guest tour opens and lists sample projects', async ({ page }) => {
    const guard = await blockWrites(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();

    await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();

    // Shape, not count: at least one project, whatever the tour holds today.
    const rows = page.locator('table.table tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);

    expect(guard.attempted, 'no writes should have been attempted').toEqual([]);
  });

  test('a guest can open a project and see its ticket list', async ({ page }) => {
    const guard = await blockWrites(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();
    await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();

    await openFirstProject(page);

    // The toolbar is the proof the Ticket Viewer rendered, not just that routing fired.
    await expect(page.getByLabel('Search tickets')).toBeVisible();
    await expect(page.getByRole('button', { name: /All states/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All types/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All tags/ })).toBeVisible();

    expect(guard.attempted).toEqual([]);
  });

  test('filtering by state round-trips to the real API', async ({ page }) => {
    const guard = await blockWrites(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();
    await openFirstProject(page);
    await expect(page.getByLabel('Search tickets')).toBeVisible();

    // Catch the request the filter causes, and check the query the UI built.
    const request = page.waitForRequest(
      (r) => r.url().includes('/tickets') && r.url().includes('state=Open'),
    );

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();

    const url = new URL((await request).url());
    expect(url.searchParams.getAll('state')).toEqual(['Open']);

    // Whatever came back, every visible row should now be Open.
    await expect(page.getByRole('button', { name: /^Open/ })).toBeVisible();
    const states = page.locator('table.table tbody tr .state');
    for (let i = 0; i < (await states.count()); i++) {
      await expect(states.nth(i)).toHaveText('Open');
    }

    expect(guard.attempted).toEqual([]);
  });

  test('a guest cannot see the create-ticket button', async ({ page }) => {
    const guard = await blockWrites(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();
    await openFirstProject(page);
    await expect(page.getByLabel('Search tickets')).toBeVisible();

    // The UI hides what the API would refuse. This checks the courtesy half; the API
    // half is enforced server-side by GuestReadOnlyFilter and is not tested here.
    //
    // The name is "Create ticket", NOT "+ Create ticket": the leading glyph is now an
    // <app-icon>, which contributes nothing to the accessible name. A toHaveCount(0)
    // written against the old string passes whether the button is there or not.
    await expect(page.getByRole('button', { name: 'Create ticket' })).toHaveCount(0);

    expect(guard.attempted).toEqual([]);
  });

  test('no console errors on the main journey', async ({ page }) => {
    await blockWrites(page);

    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();
    await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
    await openFirstProject(page);
    await expect(page.getByLabel('Search tickets')).toBeVisible();

    expect(errors, 'the deployed app should log no console errors').toEqual([]);
  });
});
