import { expect, test } from '@playwright/test';
import { IMPORTED_CASES, mockApi, openLogin } from './helpers';

/**
 * The Test Case Generator journey, end to end through the UI: sign in, choose the app, import a
 * reply any chat AI could have written, then turn a Failed case into a ticket.
 *
 * The API is mocked (see mockApi), so nothing here can reach a real AI provider — the same
 * promise the server's own tests make by pointing TestCaseGenerator:Provider at Mock.
 */
test.describe('Test Case Generator', () => {
  test('login → launcher → generator → import JSON → cases appear → ticket from a Failed case', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // 1. Signing in lands on the launcher, which offers both apps.
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Choose an app' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Q Desk', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Q Generator', level: 2 })).toBeVisible();

    // 2. The card opens the Q Generator hub, where we pick QA Generator.
    await page.getByRole('link', { name: 'Open Q Generator' }).click();
    await expect(page).toHaveURL(/\/q$/);
    await expect(page.getByRole('heading', { name: 'Q Generator', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Open QA Generator' }).click();
    await expect(page).toHaveURL(/\/q\/qa(\?|$)/);
    await expect(page.getByRole('heading', { name: 'QA Generator', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Switch app' })).toBeVisible();

    // Pick the project, then its suite.
    await page.getByRole('link', { name: /Checkout screens/ }).click();
    await expect(page).toHaveURL(/\/q\/qa\/1$/);
    await expect(page.getByRole('heading', { name: 'Test cases (0)' })).toBeVisible();

    // 3. Import / Manual: the prompt is there to copy, the reply goes in below it.
    await page.getByRole('button', { name: 'Import / Manual' }).click();
    await expect(page.getByRole('heading', { name: 'Import / Manual' })).toBeVisible();
    await expect(page.locator('.prompt-box')).toContainText('senior QA engineer');
    await page.getByLabel('JSON reply').fill(JSON.stringify({ testCases: IMPORTED_CASES }));
    await page.getByRole('button', { name: 'Import cases' }).click();

    // 4. The cases appear, numbered, as Draft.
    await expect(page.getByRole('heading', { name: 'Test cases (2)' })).toBeVisible();
    await expect(page.getByText('TC-0001')).toBeVisible();
    await expect(page.getByText('TC-0002')).toBeVisible();
    await expect(page.getByLabel('Status of TC-0001')).toHaveValue('Draft');

    // 5. A Failed case can become a ticket; a Draft one cannot.
    await expect(page.getByRole('button', { name: 'Create ticket' }).first()).toBeDisabled();
    await page.getByLabel('Status of TC-0002').selectOption('Failed');
    const row = page.locator('tr', { hasText: 'TC-0002' });
    await row.getByRole('button', { name: 'Create ticket' }).click();

    // The key comes back and links into the ticket window, so the two are one click apart.
    await expect(page.getByRole('link', { name: 'RMS-V1-0009' })).toBeVisible();
  });

  test('the new suite dialog says where screenshots go before they go', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/q/qa');
    await page.getByRole('button', { name: 'New suite' }).click();

    await expect(page.getByText('Screenshots are sent to an external AI service. Do not upload real customer data.')).toBeVisible();
    await expect(page.getByText('0 / 10 screenshots')).toBeVisible();
    // Nothing to create yet, so the button waits.
    await expect(page.getByRole('button', { name: 'Create suite' })).toBeDisabled();

    await page.getByLabel('Title *').fill('Checkout screens');
    await expect(page.getByRole('button', { name: 'Create suite' })).toBeEnabled();
  });

  test('a guest gets both launcher cards and a read-only generator', async ({ page }) => {
    await mockApi(page); // the guest tour
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('link', { name: 'Open Q Desk, the ticket tracker' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Q Generator' })).toBeVisible();

    await page.getByRole('link', { name: 'Open Q Generator' }).click();
    await page.getByRole('link', { name: 'Open QA Generator' }).click();
    await page.getByRole('link', { name: /Checkout screens/ }).click();

    // Read-only in the UI as well as at the API: nothing to press, and the reason is said out loud.
    await expect(page.getByRole('button', { name: 'Generate with AI' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New suite' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByText("You're exploring", { exact: false })).toBeVisible();
  });

  test('QC Generator lists doc sets and opens detail with screenshots and tabs', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/q/qc');

    await expect(page.getByRole('heading', { name: 'QC Generator', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Restaurant System Specs/ })).toBeVisible();

    await page.getByRole('link', { name: /Restaurant System Specs/ }).click();
    await expect(page).toHaveURL(/\/q\/qc\/1$/);
    await expect(page.getByRole('heading', { name: 'Restaurant System Specs', level: 1 })).toBeVisible();

    // Secondary sub-tabs: Screenshots, Product Documentation, User Manual
    await page.getByRole('button', { name: /Product Documentation/ }).click();
    await expect(page.getByRole('heading', { name: 'Product Specification & Documentation' })).toBeVisible();
    await expect(page.getByText('Version 1 · Generated by Ai')).toBeVisible();
  });

  test('pasting an image with Ctrl + V in New test suite dialog adds screenshot', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/q/qa');
    await page.getByRole('button', { name: 'New suite' }).click();

    await expect(page.getByText('0 / 10 screenshots')).toBeVisible();

    // Simulate Ctrl + V with an image on clipboard
    await simulatePasteImage(page, 'pasted_checkout.png');

    // Screenshot thumbnail appears, counter updates to 1 / 10
    await expect(page.getByText('1 / 10 screenshots')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Screenshots chosen' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove pasted_checkout/ })).toBeVisible();
  });

  test('pasting an image with Ctrl + V in QC Generator wizard adds logo and screenshots', async ({ page }) => {
    await mockApi(page, { editor: true });
    await openLogin(page);
    await page.getByLabel('Username').fill('dana.lee');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/q/qc');
    await page.getByRole('button', { name: 'New Doc Set' }).click();

    // Step 1: fill required info
    await page.getByLabel('Document Set Title *').fill('Order Workflow Docs');
    await page.getByLabel('Application Name *').fill('Order App');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: paste logo
    await expect(page.getByRole('heading', { name: /Application Logo/ })).toBeVisible();
    await simulatePasteImage(page, 'app_logo.png');
    await expect(page.getByAltText('App logo preview')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: paste screenshot
    await expect(page.getByText('0 / 30 screenshots')).toBeVisible();
    await simulatePasteImage(page, 'checkout_step.png');
    await expect(page.getByText('1 / 30 screenshots')).toBeVisible();
    await expect(page.getByPlaceholder('Step / Screen caption', { exact: false })).toBeVisible();
  });
});

async function simulatePasteImage(page: any, filename = 'screenshot.png') {
  await page.evaluate((name: string) => {
    const byteString = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const file = new File([ab], name, { type: 'image/png' });

    const dt = new DataTransfer();
    dt.items.add(file);

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    window.dispatchEvent(pasteEvent);
  }, filename);
}
