import { expect, test } from '@playwright/test';
import { MASK, mockApi, openLogin } from './helpers';

test.describe('Sign-in page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('the sign-in button stays disabled until both fields are filled', async ({ page }) => {
    await openLogin(page);
    const signIn = page.getByRole('button', { name: 'Sign in' });

    await expect(signIn).toBeDisabled();

    await page.getByLabel('Username').fill('dana.lee');
    await expect(signIn).toBeDisabled();

    // getByLabel, not input[type=password]. The PeekPassword directive rewrites the
    // field to type="text" so it can reveal one character at a time, so any selector
    // written against the password type silently matches nothing.
    await page.getByLabel('Password').fill('correct-horse');
    await expect(signIn).toBeEnabled();
  });

  test('typing a password leaves only the mask in the DOM', async ({ page }) => {
    await openLogin(page);
    const password = page.getByLabel('Password');

    // pressSequentially fires real key events; fill() sets the value in one shot and
    // would skip the per-character peek entirely.
    await password.pressSequentially('correct-horse', { delay: 30 });

    // The real value never reaches the element — it lives in the directive.
    await expect(password).not.toHaveValue('correct-horse');

    // Web-first assertions retry until they pass or time out, so this waits out the
    // 600ms peek timer on its own. No sleep needed.
    await expect(password).toHaveValue(MASK.repeat('correct-horse'.length));
  });

  test('a wrong password keeps you on the sign-in page and clears the box', async ({ page }) => {
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // signIn() resets the field after a failure so the next attempt starts clean.
    await expect(page.getByLabel('Password')).toHaveValue('');
  });

  test('correct credentials land on the launcher', async ({ page }) => {
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Choose an app' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('a shared ticket link opens that ticket and skips the launcher', async ({ page }) => {
    await page.goto('/projects/1?ticket=3');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The deep link wins: signing in from a shared link must not drop you on /home.
    await expect(page).toHaveURL(/\/projects\/1\?ticket=3$/);
    await expect(page.getByRole('heading', { name: 'Restaurant Management System' })).toBeVisible();
  });

  test('pressing Enter in the password box submits the form', async ({ page }) => {
    // Regression test: the peek directive used to cancel the browser's implicit form
    // submission by calling preventDefault on the insertLineBreak beforeinput event.
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByLabel('Password').press('Enter');

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Choose an app' })).toBeVisible();
  });

  test('the guest tour needs no account', async ({ page }) => {
    await openLogin(page);
    await page.getByRole('button', { name: 'Continue as a guest' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Choose an app' })).toBeVisible();
    // Both cards, and the guest is told the generator is read-only.
    await expect(page.getByRole('link', { name: 'Open Q Desk, the ticket tracker' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Q Generator' })).toBeVisible();
    await expect(page.getByText('Q Generator is read-only')).toBeVisible();
  });
});

test.describe('First run', () => {
  test('a fresh installation asks you to create an admin instead', async ({ page }) => {
    // The same route, a different API answer — no database state required.
    await mockApi(page, { needsSetup: true });
    await openLogin(page);

    await expect(page.getByRole('heading', { name: 'Create admin account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  });

  test('the create button waits for a matching confirmation', async ({ page }) => {
    await mockApi(page, { needsSetup: true });
    await openLogin(page);
    const create = page.getByRole('button', { name: /Create admin/ });

    await page.getByLabel('Display name *').fill('Dana Lee');
    await page.getByLabel('Username *').fill('dana.lee');
    await page.getByLabel(/^Password \*/).fill('correct-horse');
    await page.getByLabel('Confirm password *').fill('different-password');

    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(create).toBeDisabled();

    await page.getByLabel('Confirm password *').fill('correct-horse');
    await expect(page.getByText('Passwords do not match.')).toHaveCount(0);
    await expect(create).toBeEnabled();
  });
});
