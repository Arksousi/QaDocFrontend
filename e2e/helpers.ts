import { Page, expect } from '@playwright/test';

/** What the mask renders once a peeked character has expired (see PeekPassword). */
export const MASK = '•';

// ---------- Fixture data ----------
// Small, fixed and obviously fake. Every assertion in the suite is written against
// these, so a test failing means the UI changed — not that someone edited real data.

export const GUEST = {
  userId: 0,
  username: 'guest',
  displayName: 'Guest',
  role: 'Tester' as const,
  isActive: true,
  isGuest: true,
  createdAt: '2026-01-01T00:00:00Z',
};

export const PROJECT = {
  projectId: 1,
  projectName: 'Restaurant Management System',
  projectCode: 'RMS',
  createdAt: '2026-01-01T00:00:00Z',
  createdByName: 'Dana Lee',
  ticketCount: 3,
  openTicketCount: 2,
  lastActivity: '2026-02-01T09:00:00Z',
  myRole: 'Viewer' as const,
};

export const FOLDER = {
  folderId: 10,
  projectId: 1,
  folderName: 'Version 1',
  folderCode: 'V1',
  createdAt: '2026-01-01T00:00:00Z',
  ticketCount: 3,
  openTicketCount: 2,
};

const ticket = (
  ticketId: number,
  title: string,
  ticketType: 'Bug' | 'Enhancement' | 'Issue',
  state: string,
  tags: string[],
) => ({
  ticketId,
  projectId: 1,
  folderId: 10,
  sequence: ticketId,
  ticketKey: `RMS-V1-${String(ticketId).padStart(4, '0')}`,
  folderName: 'Version 1',
  folderCode: 'V1',
  title,
  description: null,
  ticketType,
  assignedToUserId: null,
  assignedToName: null,
  assignedByName: null,
  state,
  priority: 2,
  impact: 'Medium',
  createdAt: '2026-01-01T00:00:00Z',
  activityDate: '2026-02-01T09:00:00Z',
  createdByName: 'Dana Lee',
  updatedByName: null,
  tags,
  commentCount: 0,
  comments: [],
  history: [],
});

export const TICKETS = [
  ticket(1, 'Checkout total ignores discounts', 'Bug', 'Open', ['billing']),
  ticket(2, 'Add dark mode to the menu screen', 'Enhancement', 'In Progress', ['ui']),
  ticket(3, 'Receipt printer times out', 'Issue', 'Closed', ['hardware', 'billing']),
];

export const TAGS = ['billing', 'hardware', 'ui'];

/**
 * Serves the whole API from memory so the suite is a pure front-end test: no backend,
 * no database, and no chance of touching the live Railway instance.
 *
 * It also records every ticket-list request, so a test can assert what the UI *asked
 * for* rather than only what it drew — that is how the filter tests check that ticking
 * a box produces `?state=Open` instead of relying on client-side filtering.
 */
export async function mockApi(page: Page, options: { needsSetup?: boolean } = {}) {
  const ticketRequests: URL[] = [];

  // The API lives on another origin, so a fulfilled response is still subject to CORS,
  // and the Authorization header makes the browser send a preflight OPTIONS first.
  // Without these the requests fail before any assertion gets a chance to run.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };

  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors });
    }

    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api/, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // --- auth ---
    if (path === '/auth/status') return json({ needsSetup: options.needsSetup ?? false });
    if (path === '/auth/me') return json(GUEST);
    if (path === '/auth/guest' || path === '/auth/login') {
      // A wrong password is the one failure path the sign-in form has to handle.
      const body = (route.request().postDataJSON() ?? {}) as { password?: string };
      if (path === '/auth/login' && body.password !== 'correct-horse') {
        return json({ detail: 'Invalid username or password.' }, 401);
      }
      return json({ token: 'fake.jwt.token', expiresAt: '2099-01-01T00:00:00Z', user: GUEST });
    }

    // --- projects ---
    if (path === '/projects' || path === '/projects/recent') return json([PROJECT]);
    if (path === '/projects/1') return json(PROJECT);
    if (path === '/projects/1/folders') return json([FOLDER]);
    if (path === '/projects/1/suggestions') return json({ tags: TAGS });
    if (path === '/projects/1/assignees') return json([]);

    // --- tickets: filtered in the mock the same way the API would ---
    if (path === '/projects/1/tickets') {
      ticketRequests.push(url);
      const states = url.searchParams.getAll('state');
      const types = url.searchParams.getAll('type');
      const tags = url.searchParams.getAll('tag').map((t) => t.toLowerCase());
      const search = (url.searchParams.get('search') ?? '').toLowerCase();

      return json(
        TICKETS.filter((t) => !states.length || states.includes(t.state))
          .filter((t) => !types.length || types.includes(t.ticketType))
          .filter((t) => !tags.length || t.tags.some((tag) => tags.includes(tag.toLowerCase())))
          .filter((t) => !search || t.title.toLowerCase().includes(search) || t.ticketKey.toLowerCase().includes(search)),
      );
    }

    // Anything unmocked should be loud, not a silent empty screen.
    return json({ detail: `Unmocked endpoint: ${path}` }, 404);
  });

  return {
    /** The most recent /tickets query the app sent. */
    lastTicketQuery: () => ticketRequests.at(-1),
    ticketRequests,
  };
}

// ---------- Navigation ----------

/**
 * Waits for the login page to decide which form it shows. LoginPage asks the API first
 * and renders "Loading…" until it knows whether this is a fresh installation, so landing
 * on /login and typing straight away is a race.
 */
export async function openLogin(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /^(Sign in|Create admin account)$/ })).toBeVisible();
}

/** Signs in as a guest and waits for the project list to render. */
export async function continueAsGuest(page: Page) {
  await openLogin(page);
  await page.getByRole('button', { name: 'Continue as a guest' }).click();
  await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
}

/**
 * Opens the seeded project and waits for the ticket toolbar.
 *
 * There is no storageState shortcut in this app: QaDoc keeps its JWT in sessionStorage,
 * and Playwright's storageState only captures cookies and localStorage. A saved state
 * would silently restore a signed-out page, so every test signs in through the UI.
 */
export async function openProject(page: Page) {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /Restaurant Management System/ }).first().click();
  await expect(page.getByLabel('Search tickets')).toBeVisible();
}
