import { Page, expect, test } from '@playwright/test';
import { mockApi, openProject } from './helpers';

// A real 4×2 PNG, so the page's crop-to-square step has an actual picture to work on.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAFklEQVR42mNk+M9QzwAEjDAGEwwAAI3xBf4mKqQ3AAAAAElFTkSuQmCC', 'base64');

/** The account menu, as someone who can edit (a Leader), and the Profile page it leads to. */
test.describe('Account menu and profile', () => {
  async function openMenu(page: Page) {
    await page.locator('.user-button').click();
    return page.getByRole('menu');
  }

  test('the menu groups its entries, marks the page you are on, and hides what your role cannot use', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openProject(page);
    const menu = await openMenu(page);

    await expect(menu.getByRole('group', { name: 'Go to' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'Account' })).toBeVisible();
    // A Leader: the merged Dashboard yes, user management no.
    await expect(menu.getByRole('menuitem', { name: 'Dashboard' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'Admin' })).toHaveCount(0);
    // On a project's tickets, "Projects" is where you are.
    await expect(menu.getByRole('menuitem', { name: 'Projects' })).toHaveClass(/active/);

    await menu.getByRole('menuitem', { name: 'Profile' }).click();
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect((await openMenu(page)).getByRole('menuitem', { name: 'Profile' })).toHaveClass(/active/);
  });

  test('saving the profile sends your details, and the menu shows them', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    await (await openMenu(page)).getByRole('menuitem', { name: 'Profile' }).click();

    await page.getByLabel('Email').fill('dana@example.com');
    await page.getByLabel('Job title').fill('QA Engineer');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Profile saved.')).toBeVisible();
    await expect.poll(() => api.writes.find((w) => w.call === 'PUT /profile')?.body)
      .toMatchObject({ displayName: 'Dana Lee', email: 'dana@example.com', jobTitle: 'QA Engineer', phone: null, bio: null });
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);
    await expect((await openMenu(page)).getByText('QA Engineer')).toBeVisible();
  });

  test('a picture replaces the initials everywhere, and removing it brings them back', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    await (await openMenu(page)).getByRole('menuitem', { name: 'Profile' }).click();
    const topbarFace = page.locator('.user-button .avatar');
    await expect(topbarFace).toHaveText('DL');

    await page.getByLabel('Choose a profile picture').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Picture updated.')).toBeVisible();
    expect(api.writes.map((w) => w.call)).toContain('POST /profile/avatar');
    await expect(page.locator('.user-button img.avatar-img')).toBeVisible();
    await expect(page.locator('.profile-photo img.avatar-img')).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog', { name: 'Remove your picture?' }).getByRole('button', { name: 'Remove picture' }).click();
    await expect(page.getByText('Picture removed.')).toBeVisible();
    await expect(topbarFace).toHaveText('DL');
  });

  test('a guest has no Profile entry', async ({ page }) => {
    await mockApi(page);
    await openProject(page);
    const menu = await openMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Leave the tour' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Profile' })).toHaveCount(0);
  });
});
