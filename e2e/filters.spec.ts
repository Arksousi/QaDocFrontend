import { expect, test } from '@playwright/test';
import { mockApi, openProject } from './helpers';

/**
 * The Ticket Viewer filters are server-side: ticking a box changes the query string the
 * app sends, and the list is whatever comes back. So each test asserts both halves —
 * what the UI asked for, and what it then drew.
 */
test.describe('Ticket filters', () => {
  test('all three filters start at "All"', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    await expect(page.getByRole('button', { name: /All states/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All types/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All tags/ })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3 tickets
  });

  test('ticking a state sends ?state= and narrows the list', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();

    // The button label collapses to the single picked value.
    await expect(page.getByRole('button', { name: /^Open/ })).toBeVisible();
    await expect(page.getByText('Checkout total ignores discounts')).toBeVisible();
    await expect(page.getByText('Receipt printer times out')).toHaveCount(0);

    expect(api.lastTicketQuery()?.searchParams.getAll('state')).toEqual(['Open']);
  });

  test('two states are OR-ed into one repeated parameter', async ({ page }) => {
    const api = await mockApi(page);
    await openProject(page);

    await page.getByRole('button', { name: /All states/ }).click();
    await page.getByRole('checkbox', { name: 'Open' }).check();
    await page.getByRole('checkbox', { name: 'Closed' }).check();

    // Two or more picks show a count rather than the names.
    await expect(page.getByRole('button', { name: '2 states' })).toBeVisible();
    expect(api.lastTicketQuery()?.searchParams.getAll('state')).toEqual(['Open', 'Closed']);
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

    expect(api.lastTicketQuery()?.searchParams.getAll('tag')).toEqual(['billing']);
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
    const params = api.lastTicketQuery()?.searchParams;
    expect(params?.getAll('state')).toEqual([]);
    expect(params?.get('search')).toBeNull();
  });

  test('a search with no matches explains itself', async ({ page }) => {
    await mockApi(page);
    await openProject(page);

    // The search box is debounced by 250ms; the assertion retries, so no sleep.
    await page.getByLabel('Search tickets').fill('nothing matches this');

    await expect(page.getByRole('heading', { name: 'No tickets match these filters' })).toBeVisible();
  });
});
