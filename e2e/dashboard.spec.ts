import { Page, expect, test } from '@playwright/test';
import { continueAsGuest, mockApi } from './helpers';

/** The merged Dashboard: one menu entry, two tabs, and the old URLs still landing right. */
test.describe('Dashboard', () => {
  async function openDashboard(page: Page) {
    await page.locator('.user-button').click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  }

  test('the account menu has one Dashboard, holding both views as tabs', async ({ page }) => {
    await mockApi(page, { editor: true });
    await continueAsGuest(page);

    await openDashboard(page);
    expect(page.url()).toContain('/dashboard');

    // The Leader view opens first: the project card with its ring and contributors.
    await expect(page.getByRole('tab', { name: 'Leader Dashboard' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Restaurant Management System', level: 2 })).toBeVisible();

    // The Users view is the second tab: everyone's load, at or over their limit counted.
    await page.getByRole('tab', { name: 'Users Dashboard' }).click();
    await expect(page.getByRole('tab', { name: 'Users Dashboard' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('at or over their limit.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sam Ortiz' })).toBeVisible();
  });

  test('the old dashboard URLs open the merged page on the tab they were', async ({ page }) => {
    await mockApi(page, { editor: true });
    await continueAsGuest(page);

    await page.goto('/users-dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Users Dashboard' })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/leader');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Leader Dashboard' })).toHaveAttribute('aria-selected', 'true');
  });
});
