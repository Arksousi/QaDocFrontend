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
  assignees: [],
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

/** An account that can edit the project, for the tests that change tickets and folders. */
export const EDITOR = { ...GUEST, userId: 7, username: 'dana.lee', displayName: 'Dana Lee', role: 'Leader' as const, isGuest: false };

const person = (userId: number, displayName: string, openTickets: number, ticketLimit: number | null) =>
  ({ userId, displayName, username: displayName.toLowerCase().replace(' ', '.'), openTickets, ticketLimit });

/** People on the project: one of each load (comfortable, nearly full, full, no limit), and enough of
    them, with the outsider, for the picker to offer its search box. */
export const MEMBERS = [
  person(7, 'Dana Lee', 1, 5),
  person(8, 'Sam Ortiz', 4, 5),
  person(9, 'Rana Haddad', 5, 5),
  person(10, 'Kai Brook', 2, null),
  person(12, 'Lina Jbreel', 0, 5),
  person(13, 'Omar Aziz', 3, 8),
];
/** An active account outside the project, offered to a manager as "Add to project as Contributor". */
export const OUTSIDER = person(11, 'Noor Saleh', 0, 5);

/** An empty folder beside the seeded one, so a manager may delete it. */
export const EMPTY_FOLDER = { ...FOLDER, folderId: 11, folderName: 'Archive', folderCode: 'ARC', ticketCount: 0, openTicketCount: 0 };

/**
 * Serves the whole API from memory so the suite is a pure front-end test: no backend,
 * no database, and no chance of touching the live Railway instance.
 *
 * It also records every ticket-list request, so a test can assert what the UI *asked
 * for* rather than only what it drew — that is how the filter tests check that ticking
 * a box produces `?state=Open` instead of relying on client-side filtering.
 */
export async function mockApi(page: Page, options: { needsSetup?: boolean; user?: typeof GUEST; editor?: boolean } = {}) {
  // `editor` signs in as EDITOR, who manages the project: people to assign, an empty folder to
  // delete, and saves that succeed. Without it, the read-only guest tour.
  const editor = options.editor ?? false;
  // Whoever the sign-in answers as; the guest unless a test needs an account of its own.
  const user = options.user ?? (editor ? EDITOR : GUEST);
  const project = editor ? { ...PROJECT, myRole: 'Manager' as const } : PROJECT;
  const ticketRequests: URL[] = [];
  /** Every write the app sent, as "METHOD /path" with its body, for tests to assert on. */
  const writes: { call: string; body: unknown }[] = [];
  // The signed-in account as the Profile page edits it, and their picture (none to start).
  let profile: Record<string, unknown> = { ...user };
  let avatarVersion = 0;
  let hasAvatar = false;

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
    if (path === '/auth/me') return json(profile);
    if (path === '/auth/guest' || path === '/auth/login') {
      // A wrong password is the one failure path the sign-in form has to handle.
      const body = (route.request().postDataJSON() ?? {}) as { password?: string };
      if (path === '/auth/login' && body.password !== 'correct-horse') {
        return json({ detail: 'Invalid username or password.' }, 401);
      }
      return json({ token: 'fake.jwt.token', expiresAt: '2099-01-01T00:00:00Z', user });
    }

    // --- writes (editor only): recorded, then answered the way the API would ---
    const method = route.request().method();
    if (method !== 'GET') {
      const multipart = (route.request().headers()['content-type'] ?? '').startsWith('multipart/');
      const body = multipart ? null : route.request().postDataJSON();
      writes.push({ call: `${method} ${path}`, body });
      if (path === '/profile' && method === 'PUT') {
        profile = { ...profile, ...(body as object) };
        return json(profile);
      }
      if (path === '/profile/avatar') {
        avatarVersion += 1;
        hasAvatar = method === 'POST';
        return json({ avatarVersion });
      }
      return route.fulfill({ status: 204, headers: cors });
    }
    if (path === '/users/avatars') return json(hasAvatar ? [{ userId: user.userId, version: avatarVersion }] : []);

    // --- projects ---
    if (path === '/projects' || path === '/projects/recent') return json([project]);
    if (path === '/projects/1') return json(project);
    if (path === '/projects/1/folders') return json(editor ? [FOLDER, EMPTY_FOLDER] : [FOLDER]);
    if (path === '/projects/1/suggestions') return json({ tags: TAGS });
    if (path === '/projects/1/assignees') return json(editor ? MEMBERS : []);
    if (path === '/users/options') return json([...MEMBERS, OUTSIDER]);
    if (path === '/notifications/unread-count') return json({ count: 0 });
    if (path === '/notifications') return json([]);

    // --- one ticket, as the ticket window loads it ---
    const one = /^\/tickets\/(\d+)$/.exec(path);
    if (one) {
      const t = TICKETS.find((x) => x.ticketId === Number(one[1]));
      if (!t) return json({ detail: 'Not found' }, 404);
      return json({
        ...t,
        history: [{ historyId: 1, userId: 7, userName: 'Dana Lee', field: 'Created', oldValue: null, newValue: null, changedAt: t.createdAt }],
      });
    }

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
    writes,
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
