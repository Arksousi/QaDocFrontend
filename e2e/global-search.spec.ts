import { expect, test } from '@playwright/test';
import { continueAsGuest, mockApi, openProject } from './helpers';

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

  test('runs left to right: logo, project name, space, search, create ticket, bell, user', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openProject(page); // a page below Projects, so the back control carries the project name

    // The mark (the picture) stays; the "QaDoc" word next to it is what's gone.
    await expect(page.locator('.brand img')).toBeVisible();
    await expect(page.locator('.topbar')).not.toContainText('QaDoc');
    await expect(page.locator('.back-link')).toContainText('Restaurant Management System');

    const brand = (await page.locator('.brand').boundingBox())!;
    const back = (await page.locator('.back-link').boundingBox())!;
    const search = (await page.getByLabel('Search all projects').boundingBox())!;
    const create = (await page.getByRole('button', { name: 'Create ticket' }).boundingBox())!;
    const bell = (await page.locator('app-notification-bell').boundingBox())!;
    const user = (await page.locator('.user-button').boundingBox())!;

    // Each element starts after the previous one ends…
    expect(brand.x).toBeLessThan(back.x);
    expect(back.x + back.width).toBeLessThan(search.x);
    expect(search.x + search.width).toBeLessThanOrEqual(create.x + 4);
    expect(create.x + create.width).toBeLessThanOrEqual(bell.x + 4);
    expect(bell.x + bell.width).toBeLessThanOrEqual(user.x + 4);
    // …with a real gap — the space — between the left group and the search bar.
    expect(search.x - (back.x + back.width)).toBeGreaterThan(40);
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
