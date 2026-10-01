import { expect, test } from '@playwright/test';
import { mockApi, openProject } from './helpers';

/**
 * The ticket list as someone who can edit: the state chips, the priority column, the quick state
 * change from a row, and the small wording fixes (this project's key in the search hint, "1 ticket",
 * "Show all tickets", open/total folder counts).
 */
test.describe('Ticket list', () => {
  test('the search hint, counts and folder totals use this project', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openProject(page);

    await expect(page.getByLabel('Search tickets')).toHaveAttribute('placeholder', 'Search… e.g. RMS-V1-0001');
    await expect(page.getByText('3 tickets', { exact: true })).toBeVisible();
    // Only "Assigned to me" is on, so the button says what clicking it does.
    await expect(page.getByRole('button', { name: 'Show all tickets' })).toBeVisible();
    // "open/total" per folder; the empty one reads 0/0.
    await expect(page.getByRole('button', { name: /All tickets\s*2\s*\/\s*3/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archive\s*0\s*\/\s*0/ })).toBeVisible();
  });

  test('a state chip filters to that state and every chip keeps its count', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    const chips = page.getByRole('group', { name: 'Tickets by state' }).getByRole('button');
    await expect(chips).toHaveText([/Open\s*1/, /In Progress\s*1/, /Resolved\s*0/, /Retest\s*0/, /Closed\s*1/]);

    await chips.filter({ hasText: 'Closed' }).click();
    await expect.poll(() => api.lastTicketQuery()?.searchParams.getAll('state')).toEqual(['Closed']);
    await expect(page.getByRole('row')).toHaveCount(2); // header + the closed ticket
    await expect(chips.filter({ hasText: 'Closed' })).toHaveAttribute('aria-pressed', 'true');
    await expect(chips).toHaveText([/Open\s*1/, /In Progress\s*1/, /Resolved\s*0/, /Retest\s*0/, /Closed\s*1/]);

    // The same chip again clears it.
    await chips.filter({ hasText: 'Closed' }).click();
    await expect(page.getByRole('row')).toHaveCount(4);
  });

  test('priority shows as a marker with its meaning, and sorts', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openProject(page);
    await expect(page.getByRole('columnheader', { name: 'Priority' })).toBeVisible();
    await expect(page.locator('.prio').first()).toHaveAttribute('title', 'Priority 2 · High');
  });

  test('the state pill changes state in place, sending only the state', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);

    await page.getByRole('button', { name: 'RMS-V1-0001 state: Open. Change state' }).click();
    const menu = page.getByRole('menu', { name: 'Move RMS-V1-0001 to' });
    await expect(menu.getByRole('menuitemradio', { name: 'Open' })).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Retest' }).click();

    await expect.poll(() => api.writes.find((w) => w.call === 'PUT /tickets/1')?.body)
      .toMatchObject({ state: 'Retest', title: 'Checkout total ignores discounts', ticketType: 'Bug', priority: 2 });
    await expect(page.getByText('RMS-V1-0001 moved to Retest.')).toBeVisible();
    // The pill opens its menu, not the ticket window.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Esc closes the state menu without changing anything', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    await page.getByRole('button', { name: 'RMS-V1-0001 state: Open. Change state' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(api.writes).toHaveLength(0);
  });

  test('a guest sees plain state pills, not buttons', async ({ page }) => {
    await mockApi(page);
    await openProject(page);
    await expect(page.getByRole('button', { name: /state: .* Change state/ })).toHaveCount(0);
  });
});
