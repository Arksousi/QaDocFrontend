import { Page, expect, test } from '@playwright/test';
import { mockApi, openProject } from './helpers';

/**
 * The ticket window as someone who can edit it: the Assigned To picker, and the app's own
 * confirm dialog that replaced the browser's confirm(). A native dialog appearing at all is a
 * failure — every "are you sure?" must be the in-app one.
 */
test.describe('Ticket window', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => {
      throw new Error(`A native ${d.type()} dialog appeared: "${d.message()}"`);
    });
  });

  async function openTicket(page: Page) {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    await page.getByText('Checkout total ignores discounts').click();
    await expect(page.getByRole('dialog', { name: /RMS-V1-0001/ })).toBeVisible();
    return api;
  }

  const picker = (page: Page) => page.getByRole('button', { name: /^Assigned To:/ });
  const options = (page: Page) => page.getByRole('listbox', { name: 'Assigned To' }).getByRole('option');

  test('the picker lists people with their load, and "Full" is spelled out', async ({ page }) => {
    await openTicket(page);
    await expect(picker(page)).toHaveAccessibleName('Assigned To: Unassigned');

    await picker(page).click();
    await expect(options(page)).toHaveText([
      /Unassigned/,
      /Dana Lee\s*1\/5/,
      /Sam Ortiz\s*4\/5/,
      /Rana Haddad\s*Full/,
      /Kai Brook\s*2 open/,
      /Lina Jbreel\s*0\/5/,
      /Omar Aziz\s*3\/8/,
      /Noor Saleh\s*0\/5/,
    ]);
    // A manager sees the outsider under their own heading.
    await expect(page.getByText('Add to project as Contributor')).toBeVisible();
  });

  test('search narrows the list and the keyboard picks', async ({ page }) => {
    await openTicket(page);
    await picker(page).click();
    await page.getByRole('combobox', { name: 'Search people' }).fill('sam');
    await expect(options(page)).toHaveText([/Sam Ortiz/]);
    await page.keyboard.press('Enter');

    await expect(picker(page)).toHaveAccessibleName('Assigned To: Sam Ortiz');
    await expect(options(page)).toHaveCount(0);
  });

  test('Esc closes the list and leaves the ticket window open', async ({ page }) => {
    await openTicket(page);
    await picker(page).click();
    await expect(options(page).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(options(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /RMS-V1-0001/ })).toBeVisible();
    await expect(picker(page)).toBeFocused();
  });

  test('picking someone full warns, and saving asks in the app before assigning', async ({ page }) => {
    const api = await openTicket(page);
    await picker(page).click();
    await options(page).filter({ hasText: 'Rana Haddad' }).click();
    await expect(page.getByText('Rana Haddad is over their ticket limit.')).toBeVisible();

    await page.getByRole('button', { name: 'Save changes' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Assign anyway?' });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('Rana Haddad');

    // Cancel: nothing is sent and the edit is still there to change.
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toHaveCount(0);
    expect(api.writes.filter((w) => w.call.startsWith('PUT /tickets/'))).toHaveLength(0);

    // Assign anyway: the save goes through with her on it.
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Assign anyway' }).click();
    await expect.poll(() => api.writes.find((w) => w.call === 'PUT /tickets/1')?.body).toMatchObject({ assignedToUserIds: [9] });
  });

  test('closing with unsaved changes asks; Esc keeps the edit, Discard closes', async ({ page }) => {
    await openTicket(page);
    const window = page.getByRole('dialog', { name: /RMS-V1-0001/ });
    await window.getByLabel('Title *').fill('Checkout total ignores discount codes');

    // The Esc that asks must not also answer.
    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog', { name: 'Discard changes?' });
    await expect(ask).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ask).toHaveCount(0);
    await expect(window).toBeVisible();

    await page.keyboard.press('Escape');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click();
    await expect(window).toHaveCount(0);
  });

  test('deleting an empty folder asks in the app first', async ({ page }) => {
    const api = await mockApi(page, { editor: true });
    await openProject(page);
    await page.getByRole('button', { name: 'Delete folder Archive' }).click({ force: true });

    const ask = page.getByRole('alertdialog', { name: 'Delete folder?' });
    await expect(ask).toContainText('Archive');
    await ask.getByRole('button', { name: 'Delete folder' }).click();
    await expect.poll(() => api.writes.map((w) => w.call)).toContain('DELETE /projects/1/folders/11');
  });
});
