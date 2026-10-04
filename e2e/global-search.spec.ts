import { expect, test } from '@playwright/test';
import { continueAsGuest, mockApi } from './helpers';

/** The top-bar search box: type, get hits from any project, click through to the ticket. */
test.describe('Global search', () => {
  test('finds a ticket and opens it in the ticket window', async ({ page }) => {
    await mockApi(page, { editor: true });
    await continueAsGuest(page);

    const box = page.getByLabel('Search all projects');
    await box.fill('printer');

    // Debounced by 250ms; the assertion retries rather than sleeping.
    const hit = page.getByRole('option', { name: /Receipt printer times out/ });
    await expect(hit).toBeVisible();
    await hit.click();

    await expect(page).toHaveURL(/\/projects\/1\?ticket=3$/);
    await expect(page.getByRole('heading', { name: /Receipt printer times out/ })).toBeVisible();
  });

  test('waits for two characters, answers Enter, and admits when nothing matches', async ({ page }) => {
    await mockApi(page, { editor: true });
    await continueAsGuest(page);

    const box = page.getByLabel('Search all projects');
    await box.fill('p');
    await expect(page.getByRole('listbox', { name: 'Search results' })).toHaveCount(0);

    await box.fill('discounts');
    await expect(page.getByRole('option', { name: /Checkout total ignores discounts/ })).toBeVisible();

    // Enter opens the top hit without the mouse.
    await box.press('Enter');
    await expect(page).toHaveURL(/\/projects\/1\?ticket=1$/);

    await box.fill('zzzznothing');
    await expect(page.getByText(/No tickets match/)).toBeVisible();
  });

  test('Esc closes the results but keeps what was typed', async ({ page }) => {
    await mockApi(page, { editor: true });
    await continueAsGuest(page);

    const box = page.getByLabel('Search all projects');
    await box.fill('dark mode');
    await expect(page.getByRole('option', { name: /Add dark mode/ })).toBeVisible();

    await box.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Search results' })).toHaveCount(0);
    await expect(box).toHaveValue('dark mode');
  });
});
