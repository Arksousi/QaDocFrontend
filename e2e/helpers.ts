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

/** One project's scoreboard, for the Dashboard's Leader tab. */
export const SCOREBOARD = [
  {
    ...PROJECT,
    myRole: 'Manager' as const,
    members: MEMBERS.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      role: 'Contributor' as const,
      isActive: true,
      assigned: 5,
      closed: 2,
      openTickets: m.openTickets,
      ticketLimit: m.ticketLimit,
    })),
  },
];

/** Everyone's load across projects, for the Dashboard's Users tab. */
export const WORKLOAD = MEMBERS.map((m) => ({ ...m, role: 'Developer' as const }));

/** An empty folder beside the seeded one, so a manager may delete it. */
export const EMPTY_FOLDER = { ...FOLDER, folderId: 11, folderName: 'Archive', folderCode: 'ARC', ticketCount: 0, openTicketCount: 0 };

/** One screenshot of the suite below; the bytes are served by the attachments mock. */
export const SCREEN = { screenId: 1, suiteId: 1, attachmentId: 55, sortOrder: 0, contentType: 'image/png', byteSize: 2048 };

/**
 * A test suite with no cases yet, so a test can watch cases appear. `myRole` follows the signed-in
 * account, the same way the API fills it: a guest only ever reads.
 */
export function suite(myRole: 'Manager' | 'Viewer') {
  return {
    suiteId: 1,
    projectId: PROJECT.projectId,
    folderId: FOLDER.folderId,
    title: 'Checkout screens',
    businessDescription: 'The checkout flow of the shop: cart, address, payment, confirmation.',
    createdByUserId: 7,
    createdByName: 'Dana Lee',
    createdAt: '2026-02-01T09:00:00Z',
    isDemo: false,
    screenCount: 1,
    caseCount: 0,
    projectName: PROJECT.projectName,
    projectCode: PROJECT.projectCode,
    folderName: FOLDER.folderName,
    myRole,
    screens: [SCREEN],
    cases: [],
  };
}

/** What the import panel pastes in: a Functional case and a Failed one, ready to become a ticket. */
export const IMPORTED_CASES = [
  {
    title: 'The total is shown before paying',
    category: 'Functional',
    priority: 1,
    preconditions: 'A cart with one item',
    steps: ['Open the cart', 'Press Checkout'],
    expected: 'The total including tax is shown before paying.',
  },
  {
    title: 'An expired card is refused',
    category: 'Negative',
    priority: 2,
    preconditions: 'A saved card past its expiry date',
    steps: ['Choose the expired card', 'Press Pay'],
    expected: 'Payment is refused and the card field is highlighted.',
  },
];

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

  // The Test Case Generator's little world: one suite, and whatever the test puts into it. Kept
  // as state rather than a constant, so a second visit (or a reload) still shows the cases the
  // first one created — the same promise the API makes.
  const role = editor ? ('Manager' as const) : ('Viewer' as const);
  const cases: Record<string, unknown>[] = [];
  let nextCaseNumber = 1;

  /** One case, numbered the way the API numbers them: per suite, starting at 1. */
  const newCase = (item: Record<string, unknown>, source: 'Ai' | 'Imported' | 'Manual') => {
    const number = nextCaseNumber++;
    const priority = Number(item.priority);
    return {
      testCaseId: 500 + number,
      suiteId: 1,
      number,
      caseKey: `TC-${String(number).padStart(4, '0')}`,
      title: String(item.title ?? ''),
      category: ['Functional', 'Negative', 'Boundary', 'UI'].includes(String(item.category)) ? item.category : 'Functional',
      priority: Number.isFinite(priority) ? Math.min(4, Math.max(1, priority)) : 3,
      preconditions: String(item.preconditions ?? ''),
      steps: Array.isArray(item.steps) ? item.steps.map(String) : [],
      expected: String(item.expected ?? ''),
      status: 'Draft',
      linkedTicketId: null,
      linkedTicketKey: null,
      source,
      createdAt: '2026-02-01T09:00:00Z',
    };
  };

  const suiteDetail = () => ({ ...suite(role), cases, caseCount: cases.length, screenCount: 1 });

  /** A 1×1 PNG, so the screenshot strip has something to draw. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

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

      // --- Test Case Generator writes ---
      if (path === '/projects/1/testsuites' || /^\/projects\/\d+\/testsuites$/.test(path)) {
        return json({ id: 2 }, 201);
      }
      if (path === '/projects/1/qc/docsets' || /^\/projects\/\d+\/qc\/docsets$/.test(path)) {
        return json({ id: 2 }, 201);
      }
      if (/^\/qc\/docsets\/\d+\/screens$/.test(path)) {
        return json([{ screenId: 99, attachmentId: 10, caption: 'Pasted Screenshot', sortOrder: 1 }]);
      }
      if (/^\/testsuites\/\d+\/generate$/.test(path)) {
        const added = [
          { title: 'The total is shown before paying', category: 'Functional', priority: 1, preconditions: 'A cart with one item', steps: ['Open the cart', 'Press Checkout'], expected: 'The total including tax is shown.' },
          { title: 'Checkout is refused with an empty cart', category: 'Negative', priority: 2, preconditions: '', steps: ['Empty the cart', 'Press Checkout'], expected: 'Checkout stays disabled.' },
        ].map((item) => newCase(item, 'Ai'));
        cases.push(...added);
        return json(added);
      }
      if (/^\/testsuites\/\d+\/import$/.test(path)) {
        const raw = (body as { json?: string } | null)?.json ?? '';
        let parsed: { testCases?: unknown } | null = null;
        try {
          parsed = JSON.parse(raw) as { testCases?: unknown };
        } catch {
          parsed = null;
        }
        const items = Array.isArray(parsed?.testCases) ? (parsed!.testCases as Record<string, unknown>[]) : [];
        // The same bar the API holds: an item without a title, steps or expected result is dropped.
        const usable = items.filter(
          (item) => !!item && typeof item.title === 'string' && item.title.trim() !== ''
            && Array.isArray(item.steps) && typeof item.expected === 'string',
        );
        if (usable.length === 0) {
          return json({ title: 'The reply could not be read as test cases: nothing usable was left in it. Nothing was saved.', status: 400 }, 400);
        }
        const added = usable.map((item) => newCase(item, 'Imported'));
        cases.push(...added);
        return json(added);
      }
      const oneCase = /^\/testcases\/(\d+)$/.exec(path);
      if (oneCase && method === 'PUT') {
        const found = cases.find((c) => c.testCaseId === Number(oneCase[1]));
        if (!found) return json({ message: 'Test case not found.' }, 404);
        Object.assign(found, body ?? {});
        return route.fulfill({ status: 204, headers: cors });
      }
      if (oneCase && method === 'DELETE') {
        const index = cases.findIndex((c) => c.testCaseId === Number(oneCase[1]));
        if (index < 0) return json({ message: 'Test case not found.' }, 404);
        cases.splice(index, 1);
        return route.fulfill({ status: 204, headers: cors });
      }
      if (/^\/testcases\/\d+\/create-ticket$/.test(path)) {
        const id = Number(/^\/testcases\/(\d+)/.exec(path)![1]);
        const found = cases.find((c) => c.testCaseId === id);
        if (!found) return json({ message: 'Test case not found.' }, 404);
        if (found.linkedTicketId) return json({ message: 'This case already has a ticket.' }, 409);
        found.linkedTicketId = 99;
        found.linkedTicketKey = 'RMS-V1-0009';
        return json({ id: 99, ticketKey: 'RMS-V1-0009' });
      }
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

    // --- top-bar global search: matches title or key, over the seeded tickets ---
    if (path === '/tickets/search') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      return json(
        q.length < 2
          ? []
          : TICKETS.filter((t) => t.title.toLowerCase().includes(q) || t.ticketKey.toLowerCase().includes(q))
              .map((t) => ({
                ticketId: t.ticketId,
                projectId: t.projectId,
                projectName: PROJECT.projectName,
                ticketKey: t.ticketKey,
                title: t.title,
                state: t.state,
                ticketType: t.ticketType,
                activityDate: t.activityDate,
              })),
      );
    }

    // --- projects ---
    if (path === '/projects' || path === '/projects/recent') return json([project]);
    if (path === '/projects/1') return json(project);
    if (path === '/projects/1/folders') return json(editor ? [FOLDER, EMPTY_FOLDER] : [FOLDER]);
    if (path === '/projects/1/suggestions') return json({ tags: TAGS });
    if (path === '/projects/1/assignees') return json(editor ? MEMBERS : []);

    // --- Test Case Generator ---
    if (path === '/projects/1/testsuites') return json([{ ...suite(role), cases: [], caseCount: 0 }]);
    if (/^\/testsuites\/\d+$/.test(path)) return json(suiteDetail());
    if (/^\/testsuites\/\d+\/prompt$/.test(path))
      return json({ prompt: 'SYSTEM\nYou are a senior QA engineer. Return JSON ONLY: {"testCases":[…]}\n\nUSER\nBusiness description: …' });

    // --- QC Generator ---
    if (path === '/projects/1/qc/docsets') return json([{
      docSetId: 1,
      projectId: 1,
      title: 'Restaurant System Specs',
      appName: 'Restaurant App',
      businessDescription: 'Specs for POS & Kitchen',
      language: 'English',
      logoAttachmentId: null,
      createdBy: 7,
      createdByName: 'Dana Lee',
      createdAt: '2026-02-01T00:00:00Z',
      isDemo: false,
      screenCount: 1,
      documentCount: 1,
      myRole: role,
      projectName: 'Restaurant Management System',
      projectCode: 'RMS',
      screens: [],
      documents: [],
    }]);
    if (/^\/qc\/docsets\/\d+$/.test(path)) return json({
      docSetId: 1,
      projectId: 1,
      title: 'Restaurant System Specs',
      appName: 'Restaurant App',
      businessDescription: 'Specs for POS & Kitchen',
      language: 'English',
      logoAttachmentId: null,
      createdBy: 7,
      createdByName: 'Dana Lee',
      createdAt: '2026-02-01T00:00:00Z',
      isDemo: false,
      screenCount: 1,
      documentCount: 1,
      myRole: role,
      projectName: 'Restaurant Management System',
      projectCode: 'RMS',
      screens: [{
        screenId: 1,
        docSetId: 1,
        sortOrder: 1,
        caption: 'Login Screen',
        attachmentId: 1,
        screenSummary: '{"screenTitle":"Login"}',
        contentType: 'image/png',
        byteSize: 1024,
      }],
      documents: [{
        documentId: 1,
        docSetId: 1,
        kind: 'Documentation',
        version: 1,
        markdown: '# Product Documentation\n\nOverview of the system.',
        status: 'Draft',
        source: 'Ai',
        generatedBy: 7,
        generatedByName: 'Dana Lee',
        createdAt: '2026-02-01T00:00:00Z',
      }],
    });
    if (/^\/qc\/docsets\/\d+\/prompt/.test(path))
      return json({ prompt: 'SYSTEM\nYou are a technical writer. Write product documentation.' });

    // An <img> cannot send an Authorization header, so screenshots arrive with ?access_token=.
    if (/^\/attachments\/\d+$/.test(path))
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: png });
    if (path === '/projects/scoreboard') return json(SCOREBOARD);
    if (path === '/users/workload') return json(WORKLOAD);
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
  await openQaDocFromLauncher(page);
}

/**
 * Signing in — password, first-run admin or the guest tour — lands on the launcher. This walks
 * from there into the ticket tracker, which is what most of the suite is actually about.
 */
export async function openQaDocFromLauncher(page: Page) {
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Choose an app' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Q Desk, the ticket tracker' }).click();
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
