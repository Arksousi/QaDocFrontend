import { expect, test } from '@playwright/test';
import { GUEST, mockApi, openProject } from './helpers';

/**
 * The Ticket Viewer filters are server-side: ticking a box changes the query string the
 * app sends, and the list is whatever comes back. So each test asserts both halves —
 * what the UI asked for, and what it then drew.
 */
// The list reloads after a short debounce, so a request is awaited with expect.poll rather than
// read the instant the box is ticked.
test.describe('Ticket filters', () => {
  test('all three filters start at "All"', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    await expect(page.getByRole('button', { name: /All states/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All types/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All tags/ })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3 tickets
  });

  test('"Assigned to me" starts ticked for an account and asks for its tickets', async ({ page }) => {
    const api = await mockApi(page, { user: { ...GUEST, userId: 7, username: 'dana.lee', displayName: 'Dana Lee', isGuest: false } });
    await openProject(page);

    const mine = page.getByRole('checkbox', { name: 'Assigned to me' });
    await expect(mine).toBeChecked();
    await expect.poll(() => api.lastTicketQuery()?.searchParams.get('assignedTo')).toBe('7');

    await mine.uncheck();
    await expect.poll(() => api.lastTicketQuery()?.searchParams.get('assignedTo')).toBeNull();
  });

  test('a guest starts on the whole list', async ({ page }) => {
    await mockApi(page);
    await openProject(page);
    await expect(page.getByRole('checkbox', { name: 'Assigned to me' })).not.toBeChecked();
  });

  test('ticking a state sends ?state= and narrows the list', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();

    // The button label collapses to the single picked value.
    await expect(page.locator('.filter-button', { hasText: /^Open$/ })).toBeVisible();
    await expect(page.getByText('Checkout total ignores discounts')).toBeVisible();
    await expect(page.getByText('Receipt printer times out')).toHaveCount(0);

    await expect.poll(() => api.lastTicketQuery()?.searchParams.getAll('state')).toEqual(['Open']);
  });

  test('two states are OR-ed into one repeated parameter', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();
    await page.getByRole('checkbox', { name: 'Closed' }).check();

    // Two or more picks show a count rather than the names.
    await expect(page.getByRole('button', { name: '2 states' })).toBeVisible();
    await expect.poll(() => api.lastTicketQuery()?.searchParams.getAll('state')).toEqual(['Open', 'Closed']);
  });

  test('only one filter panel is open at a time', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await expect(page.getByRole('group', { name: 'Filter by state' })).toBeVisible();

    await page.getByRole('button', { name: /All types/ }).click();
    await expect(page.getByRole('group', { name: 'Filter by type' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Filter by state' })).toHaveCount(0);
  });

  test('a tag matches any ticket carrying it', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All tags/ }).click();
    await page.getByRole('checkbox', { name: 'billing' }).check();

    await expect.poll(() => api.lastTicketQuery()?.searchParams.getAll('tag')).toEqual(['billing']);
    // Two tickets carry "billing"; the one tagged only "ui" drops out.
    await expect(page.getByText('Checkout total ignores discounts')).toBeVisible();
    await expect(page.getByText('Receipt printer times out')).toBeVisible();
    await expect(page.getByText('Add dark mode to the menu screen')).toHaveCount(0);
  });

  test('Escape closes an open panel', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All types/ }).click();
    await expect(page.getByRole('group', { name: 'Filter by type' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Filter by type' })).toHaveCount(0);
  });

  test('"Clear filters" resets every filter at once', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();
    await page.keyboard.press('Escape');
    await page.getByLabel('Search tickets').fill('checkout');

    await page.getByRole('button', { name: 'Clear filters' }).click();

    await expect(page.getByRole('button', { name: /All states/ })).toBeVisible();
    await expect(page.getByLabel('Search tickets')).toHaveValue('');
    // "Assigned to me" starts ticked; clearing lets it go too, so the whole list comes back.
    await expect(page.getByRole('checkbox', { name: 'Assigned to me' })).not.toBeChecked();
    await expect.poll(() => {
      const params = api.lastTicketQuery()?.searchParams;
      return [params?.getAll('state'), params?.get('search'), params?.get('assignedTo')];
    }).toEqual([[], null, null]);
  });

  test('a search with no matches explains itself', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    // The search box is debounced by 250ms; the assertion retries, so no sleep.
    await page.getByLabel('Search tickets').fill('nothing matches this');

    await expect(page.getByRole('heading', { name: 'No tickets match these filters' })).toBeVisible();
  });
});
