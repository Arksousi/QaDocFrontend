import { APIRequestContext, expect, test } from '@playwright/test';
import { ACTORS, Actor, PNG, World, buildWorld, clientFor } from './actors';

/**
 * The authorization matrix: every actor against every protected endpoint, asserting the
 * exact status the API returns.
 *
 * This is the half of access control that matters. The Angular app hides a button a
 * Viewer may not press, but hiding is a courtesy — anyone can open devtools and send the
 * request. These tests bypass the UI entirely and ask the API directly.
 *
 * Reading a row: the expected status for each actor IS the specification. Where a cell
 * is `undefined`, that combination is exercised somewhere else (destructive verbs get
 * their own test with a sacrificial fixture rather than eating the shared one).
 */

type Method = 'get' | 'post' | 'put' | 'delete';

interface Case {
  name: string;
  method: Method;
  path: (w: World) => string;
  body?: (w: World) => unknown;
  /** Expected HTTP status per actor. undefined = deliberately not exercised here. */
  expected: Partial<Record<Actor, number>>;
}

// Shorthands, so a row fits on one line and the shape of the rule is visible.
const UNAUTHENTICATED = 401;
const FORBIDDEN = 403;
const HIDDEN = 404; // "not found" standing in for "forbidden" — see the note below

const CASES: Case[] = [
  // ---------- anonymous surface ----------
  {
    name: 'GET /auth/status is open to everyone',
    method: 'get',
    path: () => '/auth/status',
    expected: { anonymous: 200, guest: 200, outsider: 200, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /auth/me needs a token',
    method: 'get',
    path: () => '/auth/me',
    expected: { anonymous: UNAUTHENTICATED, guest: 200, outsider: 200, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'POST /auth/change-password refuses a guest before it validates anything',
    method: 'post',
    path: () => '/auth/change-password',
    body: () => ({ currentPassword: 'deliberately-wrong', newPassword: 'irrelevant-12345' }),
    // 400 for real accounts proves the request got as far as validation; 403 for the
    // guest proves GuestReadOnlyFilter ran first, as an authorization filter should.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: 400, viewer: 400, contributor: 400, manager: 400, admin: 400 },
  },

  // ---------- admin-only surface ----------
  {
    name: 'GET /users is Admin only',
    method: 'get',
    path: () => '/users',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: FORBIDDEN, admin: 200 },
  },
  {
    name: 'GET /projects/demo is Admin only',
    method: 'get',
    path: () => '/projects/demo',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: FORBIDDEN, admin: 200 },
  },

  // ---------- Admin and Leader surface ----------
  // manager is the only Leader; every other account is a Tester, whatever it holds on the project.
  {
    name: 'GET /projects/scoreboard is Admin or Leader only',
    method: 'get',
    path: () => '/projects/scoreboard',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: 200, admin: 200 },
  },
  {
    name: 'POST /projects is Admin or Leader only',
    method: 'post',
    path: () => '/projects',
    body: () => ({ projectName: 'Should never be created', projectCode: `NO${Date.now() % 100000}` }),
    // manager and admin left out: letting them through would leave a stray project behind on
    // every run. buildWorld creates its fixtures this way, which covers the admin allow side.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN },
  },
  {
    name: 'GET /users/workload (Users Dashboard) is Admin or Leader only',
    method: 'get',
    path: () => '/users/workload',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: 200, admin: 200 },
  },
  {
    name: 'PUT /users/{id}/ticket-limit is Admin only — a Leader reads loads but sets nobody\'s',
    method: 'put',
    path: (w) => `/users/${w.userIds['viewer']}/ticket-limit`,
    body: () => ({ ticketLimit: null }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: FORBIDDEN, admin: 204 },
  },
  {
    name: 'GET /users/{id}/card (avatar hover card) is Admin or Leader only',
    method: 'get',
    path: (w) => `/users/${w.userIds['contributor']}/card`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: 200, admin: 200 },
  },
  {
    name: 'PUT /projects/{id}/members refuses the retired Manager role',
    method: 'put',
    path: (w) => `/projects/${w.projectId}/members`,
    body: (w) => ({ userId: w.userIds['viewer'], role: 'Manager' }),
    expected: { manager: 400, admin: 400 },
  },

  // ---------- profiles and pictures ----------
  {
    name: 'GET /users/avatars is anyone signed in, not a guest',
    method: 'get',
    path: () => '/users/avatars',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: 200, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /users/{id}/avatar is anyone signed in; no picture is a 404',
    method: 'get',
    // The viewer never uploads one in this suite, so every signed-in actor gets the same 404.
    path: (w) => `/users/${w.userIds['viewer']}/avatar`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: HIDDEN, contributor: HIDDEN, manager: HIDDEN, admin: HIDDEN },
  },
  {
    name: 'PUT /profile refuses a guest before it validates anything',
    method: 'put',
    path: () => '/profile',
    // An invalid email: 400 shows a real account got as far as validation, without changing anything.
    body: () => ({ displayName: 'Irrelevant', email: 'not-an-email' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: 400, viewer: 400, contributor: 400, manager: 400, admin: 400 },
  },
  {
    name: 'DELETE /profile/avatar refuses a guest',
    method: 'delete',
    path: () => '/profile/avatar',
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN },
  },

  // ---------- your own notifications ----------
  {
    name: 'GET /notifications is anyone signed in, always their own',
    method: 'get',
    path: () => '/notifications',
    expected: { anonymous: UNAUTHENTICATED, guest: 200, outsider: 200, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },

  // ---------- project membership ----------
  {
    name: 'GET /projects lists only what you can see',
    method: 'get',
    path: () => '/projects',
    expected: { anonymous: UNAUTHENTICATED, guest: 200, outsider: 200, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /projects/{id} hides a project you do not belong to',
    method: 'get',
    path: (w) => `/projects/${w.projectId}`,
    // The important cells: outsider and guest get 404, NOT 403. A 403 would confirm the
    // project exists, which is an information leak — someone could walk the id space and
    // learn how many projects there are. This is the "not found over forbidden" rule.
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /projects/{id}/tickets hides a project you do not belong to',
    method: 'get',
    path: (w) => `/projects/${w.projectId}/tickets`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /projects/{id}/members hides a project you do not belong to',
    method: 'get',
    path: (w) => `/projects/${w.projectId}/members`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },

  // ---------- Manager-only writes ----------
  {
    name: 'PUT /projects/{id}/members needs Manager',
    method: 'put',
    path: (w) => `/projects/${w.projectId}/members`,
    body: (w) => ({ userId: w.userIds['viewer'], role: 'Viewer' }),
    // Note the asymmetry: a member who lacks the level gets 403 (the project is no secret
    // to them), an outsider still gets 404 (it is).
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: 204, admin: 204 },
  },
  {
    name: 'POST /projects/{id}/folders needs Manager',
    method: 'post',
    path: (w) => `/projects/${w.projectId}/folders`,
    body: () => ({ folderName: `Authz ${Date.now()}`, folderCode: `A${Date.now() % 100000}` }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: 201, admin: 201 },
  },

  // ---------- Contributor-level writes ----------
  {
    name: 'POST /tickets needs Contributor',
    method: 'post',
    path: () => '/tickets',
    body: (w) => ({
      folderId: w.folderId,
      title: 'Created by the authorization matrix',
      description: '',
      ticketType: 'Bug',
      assignedToUserIds: [],
      state: 'Open',
      priority: 2,
      impact: 'Medium',
      tags: [],
    }),
    // The outsider gets 400, not 404: the folder id is in the body, so the API answers
    // "folder #N does not exist" through validation rather than admitting it exists.
    // Same instinct as the 404s above, different mechanism.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: 400, viewer: FORBIDDEN, contributor: 201, manager: 201, admin: 201 },
  },
  {
    name: 'PUT /tickets/{id} needs Contributor',
    method: 'put',
    path: (w) => `/tickets/${w.ticketId}`,
    body: (w) => ({
      folderId: w.folderId,
      title: 'Edited by the authorization matrix',
      description: '',
      ticketType: 'Bug',
      assignedToUserIds: [],
      state: 'Open',
      priority: 2,
      impact: 'Medium',
      tags: [],
    }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 204, manager: 204, admin: 204 },
  },
  {
    name: 'POST /tickets/{id}/comments needs membership',
    method: 'post',
    path: (w) => `/tickets/${w.ticketId}/comments`,
    body: () => ({ text: 'Comment from the authorization matrix' }),
    // Any member may comment, including a Viewer — commenting is not editing. 200, not 201: the
    // endpoint answers with the saved comment itself (Ok(comment)) rather than a Created pointer.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },

  // ---------- Test Case Generator ----------
  {
    name: 'GET /projects/{id}/testsuites hides a project you do not belong to',
    method: 'get',
    path: (w) => `/projects/${w.projectId}/testsuites`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /testsuites/{id} hides a suite you cannot see',
    method: 'get',
    path: (w) => `/testsuites/${w.suiteId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /testsuites/{id}/prompt is readable by every member: it is the manual route',
    method: 'get',
    path: (w) => `/testsuites/${w.suiteId}/prompt`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'POST /testsuites/{id}/import needs Contributor and refuses a guest before it parses',
    method: 'post',
    path: (w) => `/testsuites/${w.suiteId}/import`,
    // Deliberately unparseable: a 400 proves the actor got as far as the parser (nothing is
    // saved), where a 403/404 proves the request stopped at the permission check.
    body: () => ({ json: 'not JSON, on purpose' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 400, manager: 400, admin: 400 },
  },
  {
    name: 'POST /testsuites/{id}/generate needs Contributor',
    method: 'post',
    path: (w) => `/testsuites/${w.suiteId}/generate`,
    body: () => ({}),
    // Answered by the Mock provider (run-authz-tests.ps1 sets TestCaseGenerator__Provider),
    // so this row proves permissions without a real AI call or a real key.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'PUT /testcases/{id} needs Contributor',
    method: 'put',
    path: (w) => `/testcases/${w.caseId}`,
    body: () => ({ title: 'Renamed by the authorization matrix' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 204, manager: 204, admin: 204 },
  },
  {
    name: 'POST /testcases/{id}/create-ticket is refused before it reaches ticket creation',
    method: 'post',
    path: (w) => `/testcases/${w.caseId}/create-ticket`,
    body: () => ({}),
    // contributor/manager/admin are left out: the first one through would link the fixture
    // case to a ticket and the rest would answer 409. The allow side has its own test below.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN },
  },
  {
    name: 'DELETE /testcases/{id} is refused before it reaches the delete',
    method: 'delete',
    path: (w) => `/testcases/${w.caseId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN },
  },
  {
    name: 'DELETE /testsuites/{id} is refused before it reaches the delete',
    method: 'delete',
    path: (w) => `/testsuites/${w.suiteId}`,
    // A Contributor who did not create the suite cannot delete it; only the owner or a manager
    // can. manager and admin would eat the fixture, so the allow side is a separate test.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN },
  },

  // ---------- QC Generator surface ----------
  {
    name: 'GET /projects/{id}/qc/docsets is readable by every member',
    method: 'get',
    path: (w) => `/projects/${w.projectId}/qc/docsets`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /qc/docsets/{id} hides a docset you cannot see',
    method: 'get',
    path: (w) => `/qc/docsets/${w.docSetId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'GET /qc/docsets/{id}/prompt is readable by every member: it is the manual route',
    method: 'get',
    path: (w) => `/qc/docsets/${w.docSetId}/prompt?kind=Documentation`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'POST /qc/docsets/{id}/import needs Contributor and refuses a guest',
    method: 'post',
    path: (w) => `/qc/docsets/${w.docSetId}/import`,
    body: () => ({ kind: 'Documentation', markdown: '# Updated by matrix' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'POST /qc/docsets/{id}/generate needs Contributor',
    method: 'post',
    path: (w) => `/qc/docsets/${w.docSetId}/generate`,
    body: () => ({ kind: 'Documentation' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'PUT /qc/docsets/{id} needs Contributor',
    method: 'put',
    path: (w) => `/qc/docsets/${w.docSetId}`,
    body: () => ({ title: 'Renamed by authorization matrix' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 204, manager: 204, admin: 204 },
  },
  {
    name: 'GET /qc/documents/{id} is readable by every member',
    method: 'get',
    path: (w) => `/qc/documents/${w.docId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'PUT /qc/documents/{id} needs Contributor',
    method: 'put',
    path: (w) => `/qc/documents/${w.docId}`,
    body: () => ({ markdown: '# Edited by authorization matrix' }),
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: 204, manager: 204, admin: 204 },
  },
  {
    name: 'GET /qc/documents/{id}/export is readable by every member',
    method: 'get',
    path: (w) => `/qc/documents/${w.docId}/export?format=docx`,
    expected: { anonymous: UNAUTHENTICATED, guest: HIDDEN, outsider: HIDDEN, viewer: 200, contributor: 200, manager: 200, admin: 200 },
  },
  {
    name: 'DELETE /qc/docsets/{id} is refused before it reaches the delete',
    method: 'delete',
    path: (w) => `/qc/docsets/${w.docSetId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN },
  },

  // ---------- destructive: denial only ----------
  // admin is left undefined on purpose. Letting it through would delete the fixture every
  // other row depends on; the allow side is covered by its own test below.
  {
    name: 'DELETE /tickets/{id} is Admin only',
    method: 'delete',
    path: (w) => `/tickets/${w.ticketId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: FORBIDDEN },
  },
  {
    name: 'DELETE /projects/{id} is Admin only',
    method: 'delete',
    path: (w) => `/projects/${w.projectId}`,
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: FORBIDDEN, viewer: FORBIDDEN, contributor: FORBIDDEN, manager: FORBIDDEN },
  },
];

// ---------------------------------------------------------------------------

let world: World;
const clients = new Map<Actor, APIRequestContext>();

test.beforeAll(async () => {
  world = await buildWorld();
  for (const actor of ACTORS) clients.set(actor, await clientFor(world.tokens[actor]));
});

test.afterAll(async () => {
  for (const client of clients.values()) await client.dispose();
});

test.describe('Authorization matrix', () => {
  for (const testCase of CASES) {
    for (const actor of ACTORS) {
      const expectedStatus = testCase.expected[actor];
      if (expectedStatus === undefined) continue;

      test(`${testCase.name} — as ${actor} → ${expectedStatus}`, async () => {
        const client = clients.get(actor)!;
        const url = testCase.path(world);
        const options = testCase.body ? { data: testCase.body(world) } : undefined;
        const response = await client[testCase.method](url, options);

        expect(
          response.status(),
          `${testCase.method.toUpperCase()} ${url} as ${actor} should be ${expectedStatus}, ` +
            `got ${response.status()}: ${(await response.text()).slice(0, 200)}`,
        ).toBe(expectedStatus);
      });
    }
  }
});

test.describe('Cross-project access (BOLA / IDOR)', () => {
  // The classic broken-object-level-authorization check: a legitimate user with a valid
  // token swaps in an id belonging to someone else's project. Every one of these must be
  // indistinguishable from "does not exist".

  test('a Manager of one project cannot read another', async () => {
    const response = await clients.get('manager')!.get(`/projects/${world.otherProjectId}`);
    expect(response.status()).toBe(HIDDEN);
  });

  test('a Manager cannot read a ticket in another project', async () => {
    const response = await clients.get('manager')!.get(`/tickets/${world.otherTicketId}`);
    expect(response.status()).toBe(HIDDEN);
  });

  test('a Manager cannot edit a ticket in another project', async () => {
    const response = await clients.get('manager')!.put(`/tickets/${world.otherTicketId}`, {
      data: {
        folderId: world.folderId,
        title: 'Should never be written',
        description: '',
        ticketType: 'Bug',
        assignedToUserIds: [],
        state: 'Open',
        priority: 2,
        impact: 'Medium',
        tags: [],
      },
    });
    expect(response.status()).toBe(HIDDEN);
  });

  test('a Manager cannot add themselves to another project', async () => {
    const response = await clients.get('manager')!.put(`/projects/${world.otherProjectId}/members`, {
      data: { userId: world.userIds['manager'], role: 'Contributor' },
    });
    expect(response.status()).toBe(HIDDEN);
  });

  test('a missing project and a hidden project look identical', async () => {
    // If these differ, the status code itself is an oracle for "this id exists".
    const manager = clients.get('manager')!;
    const hidden = await manager.get(`/projects/${world.otherProjectId}`);
    const absent = await manager.get('/projects/999999999');
    expect(hidden.status()).toBe(absent.status());
  });
});

test.describe('Assigning a ticket to someone outside the project', () => {
  // Its own throwaway user each time: a successful assignment adds them to the project, which
  // would change what the shared outsider actor can see in every matrix row above.
  const newcomer = async () => {
    const response = await clients.get('admin')!.post('/users', {
      data: { username: `authz.newcomer.${Date.now()}`, displayName: 'Authz newcomer', password: 'test-password-123', role: 'Tester' },
    });
    return (await response.json()).id as number;
  };
  const assignTo = (actor: Actor, userId: number) =>
    clients.get(actor)!.put(`/tickets/${world.ticketId}`, {
      data: {
        folderId: world.folderId, title: 'Authorization fixture ticket', description: '', ticketType: 'Bug',
        assignedToUserIds: [userId], state: 'Open', priority: 2, impact: 'Medium', tags: [],
      },
    });

  test('a plain Contributor is refused', async () => {
    expect((await assignTo('contributor', await newcomer())).status()).toBe(400);
  });

  test('a managing Leader adds them as a Contributor', async () => {
    const userId = await newcomer();
    expect((await assignTo('manager', userId)).status()).toBe(204);

    const members = await (await clients.get('admin')!.get(`/projects/${world.projectId}/members`)).json();
    expect(members.find((m: { userId: number }) => m.userId === userId)?.role).toBe('Contributor');
  });
});

test.describe('Assignment notifications', () => {
  interface Note { notificationId: number; ticketId: number; isRead: boolean }
  const notesOf = async (actor: Actor): Promise<Note[]> => (await clients.get(actor)!.get('/notifications?top=50')).json();

  test('the assignee is told, the person assigning is not, and nobody else can clear it', async () => {
    // A fresh ticket assigned on creation, so earlier rows cannot have produced a match.
    const created = await clients.get('admin')!.post('/tickets', {
      data: {
        folderId: world.folderId, title: 'Notification check', description: '', ticketType: 'Bug',
        assignedToUserIds: [world.userIds['contributor']], state: 'Open', priority: 2, impact: 'Medium', tags: [],
      },
    });
    const { id: ticketId } = await created.json();

    const note = (await notesOf('contributor')).find((n) => n.ticketId === ticketId);
    expect(note, 'the contributor should have been notified').toBeDefined();
    expect(note!.isRead).toBe(false);
    expect((await notesOf('admin')).some((n) => n.ticketId === ticketId)).toBe(false);

    // Someone else's id must look missing, not forbidden, and must not mark it read.
    expect((await clients.get('viewer')!.post(`/notifications/${note!.notificationId}/read`)).status()).toBe(HIDDEN);
    expect((await clients.get('contributor')!.post(`/notifications/${note!.notificationId}/read`)).status()).toBe(204);
    expect((await notesOf('contributor')).find((n) => n.ticketId === ticketId)!.isRead).toBe(true);
  });
});

test.describe('Retest notifications', () => {
  interface Note { ticketId: number; kind: string }
  const body = (state: string, title = 'Retest check') => ({
    folderId: world.folderId, title, description: '', ticketType: 'Bug',
    assignedToUserIds: [world.userIds['contributor']],
    state, priority: 2, impact: 'Medium', tags: [],
  });
  const retestNotes = async (actor: Actor, ticketId: number) =>
    ((await (await clients.get(actor)!.get('/notifications?top=50')).json()) as Note[])
      .filter((n) => n.ticketId === ticketId && n.kind === 'Retest').length;

  test('moving to Retest tells the assignee (never the mover), once per move', async () => {
    const { id } = await (await clients.get('admin')!.post('/tickets', { data: body('Resolved') })).json();
    expect(await retestNotes('contributor', id)).toBe(0);

    const manager = clients.get('manager')!;
    expect((await manager.put(`/tickets/${id}`, { data: body('Retest') })).status()).toBe(204);
    expect(await retestNotes('contributor', id)).toBe(1);
    expect(await retestNotes('manager', id), 'whoever moved it is not told').toBe(0);

    // Saving other fields while it stays in Retest is not another move.
    expect((await manager.put(`/tickets/${id}`, { data: body('Retest', 'Retest check, renamed') })).status()).toBe(204);
    expect(await retestNotes('contributor', id)).toBe(1);

    // Back out and in again is a second move.
    expect((await manager.put(`/tickets/${id}`, { data: body('In Progress') })).status()).toBe(204);
    expect((await manager.put(`/tickets/${id}`, { data: body('Retest') })).status()).toBe(204);
    expect(await retestNotes('contributor', id)).toBe(2);
  });
});

test.describe('One person per ticket', () => {
  interface Assignee { userId: number; assignedByName: string | null }
  const body = (assignedToUserIds: number[]) => ({
    folderId: world.folderId, title: 'Owned ticket', description: '', ticketType: 'Bug',
    assignedToUserIds, state: 'Open', priority: 2, impact: 'Medium', tags: [],
  });

  test('two people are refused, on create and on update', async () => {
    const admin = clients.get('admin')!;
    const pair = [world.userIds['contributor'], world.userIds['manager']];
    expect((await admin.post('/tickets', { data: body(pair) })).status()).toBe(400);

    const { id } = await (await admin.post('/tickets', { data: body([world.userIds['contributor']]) })).json();
    expect((await admin.put(`/tickets/${id}`, { data: body(pair) })).status()).toBe(400);
  });

  test('reassigning replaces the person, and the new one is told', async () => {
    const admin = clients.get('admin')!;
    const { id } = await (await admin.post('/tickets', { data: body([world.userIds['contributor']]) })).json();
    const assignees = async (): Promise<Assignee[]> => (await (await admin.get(`/tickets/${id}`)).json()).assignees;
    expect((await assignees()).map((a) => a.userId)).toEqual([world.userIds['contributor']]);

    expect((await admin.put(`/tickets/${id}`, { data: body([world.userIds['manager']]) })).status()).toBe(204);
    expect((await assignees()).map((a) => a.userId)).toEqual([world.userIds['manager']]);
    const notes: { ticketId: number }[] = await (await clients.get('manager')!.get('/notifications?top=50')).json();
    expect(notes.some((n) => n.ticketId === id), 'the new assignee should have been notified').toBe(true);

    // "Assigned to me" no longer finds it for the person it was taken from.
    const mine: { ticketId: number }[] = await (await clients.get('contributor')!
      .get(`/projects/${world.projectId}/tickets?assignedTo=${world.userIds['contributor']}`)).json();
    expect(mine.some((t) => t.ticketId === id)).toBe(false);
  });

  test('a save that leaves the list out keeps the assignee (an older app)', async () => {
    const admin = clients.get('admin')!;
    const { id } = await (await admin.post('/tickets', { data: body([world.userIds['contributor']]) })).json();

    const { assignedToUserIds: _omitted, ...legacy } = body([]);
    expect((await admin.put(`/tickets/${id}`, { data: { ...legacy, title: 'Edited by an old app' } })).status()).toBe(204);

    const after: Assignee[] = (await (await admin.get(`/tickets/${id}`)).json()).assignees;
    expect(after.map((a) => a.userId)).toEqual([world.userIds['contributor']]);
  });
});

test.describe('Ticket limits', () => {
  interface Option { userId: number; openTickets: number; ticketLimit: number | null }
  const setLimit = (ticketLimit: number | null) =>
    clients.get('admin')!.put(`/users/${world.userIds['contributor']}`, {
      data: { displayName: 'Authz contributor', role: 'Tester', isActive: true, ticketLimit },
    });
  const load = async (): Promise<Option> => {
    const people: Option[] = await (await clients.get('admin')!.get(`/projects/${world.projectId}/assignees`)).json();
    return people.find((p) => p.userId === world.userIds['contributor'])!;
  };
  const ticket = (state: string) => ({
    folderId: world.folderId, title: 'Limit check', description: '', ticketType: 'Bug',
    assignedToUserIds: [world.userIds['contributor']], state, priority: 2, impact: 'Medium', tags: [],
  });

  test('the limit is saved, and a nonsense one refused', async () => {
    expect((await setLimit(0)).status()).toBe(400);
    expect((await setLimit(1)).status()).toBe(204);
    expect((await load()).ticketLimit).toBe(1);
  });

  test('assigning past the limit is only a warning: the API accepts it, and Closed does not count', async () => {
    await setLimit(1);
    const before = (await load()).openTickets;

    const created = await clients.get('admin')!.post('/tickets', { data: ticket('Open') });
    expect(created.status(), 'over the limit must still be accepted').toBe(201);
    const { id } = await created.json();
    expect((await load()).openTickets).toBe(before + 1);

    expect((await clients.get('admin')!.put(`/tickets/${id}`, { data: ticket('Closed') })).status()).toBe(204);
    expect((await load()).openTickets).toBe(before);

    await setLimit(null);
    expect((await load()).ticketLimit).toBeNull();
  });
});

test.describe('Avatar hover card', () => {
  interface Card { openTickets: number; closedTickets: number; totalAssigned: number; projects: { projectId: number }[] }
  const cardOf = async (viewer: Actor, userId: number): Promise<Card> =>
    (await clients.get(viewer)!.get(`/users/${userId}/card`)).json();

  test('its unfinished count is the same number the Users Dashboard shows', async () => {
    const id = world.userIds['contributor'];
    const card = await cardOf('admin', id);
    const workload: { userId: number; openTickets: number }[] = await (await clients.get('admin')!.get('/users/workload')).json();
    expect(card.openTickets).toBe(workload.find((w) => w.userId === id)!.openTickets);
    expect(card.totalAssigned).toBe(card.openTickets + card.closedTickets);
  });

  test('a Leader is not told about projects they cannot open', async () => {
    // The admin created both fixture projects, so it is on both; the Leader is only on the first.
    const adminId: number = (await (await clients.get('admin')!.get('/auth/me')).json()).userId;
    const seenByAdmin = (await cardOf('admin', adminId)).projects.map((p) => p.projectId);
    const seenByLeader = (await cardOf('manager', adminId)).projects.map((p) => p.projectId);

    expect(seenByAdmin).toEqual(expect.arrayContaining([world.projectId, world.otherProjectId]));
    expect(seenByLeader).toContain(world.projectId);
    expect(seenByLeader).not.toContain(world.otherProjectId);
  });

  test('an unknown user is a 404', async () => {
    expect((await clients.get('admin')!.get('/users/999999999/card')).status()).toBe(HIDDEN);
  });
});

test.describe('Profiles and pictures', () => {
  // A real 1×1 PNG: the API judges a picture by its bytes, not by the declared type.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  interface Me { userId: number; displayName: string; email: string | null; jobTitle: string | null; phone: string | null; bio: string | null; avatarVersion: number }
  const me = async (actor: Actor): Promise<Me> => (await clients.get(actor)!.get('/auth/me')).json();

  test('you edit your own profile, blanks are stored as empty, and nobody else changes', async () => {
    const contributor = clients.get('contributor')!;
    const before = await me('contributor');
    const adminBefore = await me('admin');

    const saved = await contributor.put('/profile', {
      data: { displayName: before.displayName, email: 'contributor@example.com', jobTitle: 'QA Engineer', phone: '+961 70 123 456', bio: '  ' },
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({ userId: before.userId, email: 'contributor@example.com', jobTitle: 'QA Engineer', bio: null });
    expect(await me('contributor')).toMatchObject({ jobTitle: 'QA Engineer', phone: '+961 70 123 456' });
    // Only the caller's row moved.
    expect(await me('admin')).toMatchObject({ email: adminBefore.email, jobTitle: adminBefore.jobTitle });

    // Put it back for the rest of the suite.
    await contributor.put('/profile', { data: { displayName: before.displayName, email: null, jobTitle: null, phone: null, bio: null } });
  });

  test('bad values are refused', async () => {
    const c = clients.get('contributor')!;
    const name = (await me('contributor')).displayName;
    expect((await c.put('/profile', { data: { displayName: name, phone: 'call me maybe' } })).status()).toBe(400);
    expect((await c.put('/profile', { data: { displayName: '   ' } })).status()).toBe(400);
    expect((await c.put('/profile', { data: { displayName: name, bio: 'x'.repeat(501) } })).status()).toBe(400);
  });

  test('a picture round trip: upload, list, fetch, refuse a fake, remove', async () => {
    const c = clients.get('contributor')!;
    const id = world.userIds['contributor'];

    const up = await c.post('/profile/avatar', { multipart: { file: { name: 'me.png', mimeType: 'image/png', buffer: PNG } } });
    expect(up.status()).toBe(200);
    const { avatarVersion } = await up.json();
    expect(avatarVersion).toBeGreaterThan(0);

    const listed: { userId: number; version: number }[] = await (await clients.get('viewer')!.get('/users/avatars')).json();
    expect(listed).toContainEqual({ userId: id, version: avatarVersion });
    const pic = await clients.get('viewer')!.get(`/users/${id}/avatar?v=${avatarVersion}`);
    expect(pic.status()).toBe(200);
    expect(pic.headers()['content-type']).toBe('image/png');
    expect(Buffer.compare(await pic.body(), PNG)).toBe(0);

    // Calling a text file a PNG does not make it one.
    const fake = await c.post('/profile/avatar', { multipart: { file: { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') } } });
    expect(fake.status()).toBe(400);

    const gone = await c.delete('/profile/avatar');
    expect((await gone.json()).avatarVersion).toBeGreaterThan(avatarVersion);
    expect((await clients.get('viewer')!.get(`/users/${id}/avatar`)).status()).toBe(HIDDEN);
    const after: { userId: number }[] = await (await c.get('/users/avatars')).json();
    expect(after.some((a) => a.userId === id)).toBe(false);
  });
});

test.describe('Mentions in comments', () => {
  interface Note { ticketId: number; kind: string }
  const mentionsOn = async (actor: Actor, ticketId: number) =>
    ((await (await clients.get(actor)!.get('/notifications?top=50')).json()) as Note[])
      .filter((n) => n.ticketId === ticketId && n.kind === 'Mentioned').length;

  test('Contributors mentioned are told; an outsider, a Viewer and the author are dropped', async () => {
    const { id } = await (await clients.get('admin')!.post('/tickets', {
      data: {
        folderId: world.folderId, title: 'Mention check', description: '', ticketType: 'Bug',
        assignedToUserIds: [], state: 'Open', priority: 2, impact: 'Medium', tags: [],
      },
    })).json();

    const u = world.userIds;
    // Posted by the contributor, who also names themselves: that tells nobody anything.
    const posted = await clients.get('contributor')!.post(`/tickets/${id}/comments`, {
      data: { text: 'Can you look?', mentionedUserIds: [u['manager'], u['outsider'], u['viewer'], u['contributor']] },
    });
    expect(posted.status()).toBe(200);
    const comment: { mentions: { userId: number }[] } = await posted.json();
    expect(comment.mentions.map((m) => m.userId)).toEqual([u['manager']]);

    expect(await mentionsOn('manager', id)).toBe(1);
    expect(await mentionsOn('viewer', id)).toBe(0);
    expect(await mentionsOn('contributor', id)).toBe(0);

    // The mention survives a reload of the ticket, so the app can keep highlighting it.
    const ticket: { comments: { mentions: { userId: number }[] }[] } = await (await clients.get('admin')!.get(`/tickets/${id}`)).json();
    expect(ticket.comments[0].mentions.map((m) => m.userId)).toEqual([u['manager']]);
  });
});

test.describe('Test Case Generator', () => {
  // Creating a suite is multipart, which the row table cannot express, so it lives here.
  const newSuite = () => ({
    multipart: {
      title: `Should never exist ${Date.now()}`,
      description: '',
      images: { name: 'screen.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  const oneCase = () => ({
    json: JSON.stringify({
      testCases: [{
        title: 'A case made by the matrix', category: 'Functional', priority: 3,
        preconditions: '', steps: ['Do the thing'], expected: 'The thing is done.',
      }],
    }),
  });

  test('creating a suite needs Contributor, and a project you cannot see looks missing', async () => {
    expect((await clients.get('guest')!.post(`/projects/${world.projectId}/testsuites`, newSuite())).status()).toBe(FORBIDDEN);
    expect((await clients.get('viewer')!.post(`/projects/${world.projectId}/testsuites`, newSuite())).status()).toBe(FORBIDDEN);
    expect((await clients.get('outsider')!.post(`/projects/${world.projectId}/testsuites`, newSuite())).status()).toBe(HIDDEN);
    expect((await clients.get('contributor')!.post(`/projects/${world.projectId}/testsuites`, newSuite())).status()).toBe(201);
  });

  test('a screenshot is judged by its bytes, not by its name', async () => {
    const response = await clients.get('contributor')!.post(`/projects/${world.projectId}/testsuites`, {
      multipart: {
        title: 'A GIF pretending to be a screenshot',
        description: '',
        images: { name: 'screen.png', mimeType: 'image/png', buffer: Buffer.from('not a picture at all') },
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.text()).toLowerCase()).toContain('png, jpeg or webp');
  });

  test('a Failed case becomes exactly one ticket, linked both ways', async () => {
    const admin = clients.get('admin')!;
    const imported = await admin.post(`/testsuites/${world.suiteId}/import`, { data: oneCase() });
    expect(imported.status()).toBe(200);
    const caseId = ((await imported.json())[0] as { testCaseId: number }).testCaseId;

    expect((await admin.put(`/testcases/${caseId}`, { data: { status: 'Failed' } })).status()).toBe(204);

    const first = await admin.post(`/testcases/${caseId}/create-ticket`, { data: {} });
    expect(first.status()).toBe(200);
    const { id: ticketId, ticketKey } = await first.json();
    expect(ticketKey).toMatch(/-\d{4}$/);

    // Asking again must not mint a second ticket.
    expect((await admin.post(`/testcases/${caseId}/create-ticket`, { data: {} })).status()).toBe(409);

    // Both sides point at each other: the ticket is a Bug with the case's steps in it…
    const loaded: { ticketType: string; description: string; history: { field: string }[] } =
      await (await admin.get(`/tickets/${ticketId}`)).json();
    expect(loaded.ticketType).toBe('Bug');
    expect(loaded.description).toContain('Steps to Reproduce');
    expect(loaded.description).toContain('A case made by the matrix');
    expect(loaded.history.some((h) => h.field === 'Created')).toBe(true);

    // …and the case carries the ticket key back.
    const suite: { cases: { testCaseId: number; linkedTicketKey: string }[] } =
      await (await admin.get(`/testsuites/${world.suiteId}`)).json();
    expect(suite.cases.find((c) => c.testCaseId === caseId)?.linkedTicketKey).toBe(ticketKey);
  });

  test('a suite can be deleted only by its owner or a manager', async () => {
    const admin = clients.get('admin')!;
    const created = await admin.post(`/projects/${world.projectId}/testsuites`, newSuite());
    const { id } = await created.json();

    expect((await clients.get('contributor')!.delete(`/testsuites/${id}`)).status()).toBe(FORBIDDEN);
    expect((await admin.get(`/testsuites/${id}`)).status()).toBe(200);

    expect((await admin.delete(`/testsuites/${id}`)).status()).toBe(204);
    expect((await admin.get(`/testsuites/${id}`)).status()).toBe(HIDDEN);
  });

  test('a docset can be deleted by a manager or admin', async () => {
    const admin = clients.get('admin')!;
    const created = await admin.post(`/projects/${world.projectId}/qc/docsets`, {
      multipart: {
        title: 'Sacrificial docset',
        appName: 'Sacrificial',
        language: 'English',
        screens: { name: 'screen.png', mimeType: 'image/png', buffer: PNG },
      },
    });
    const { id } = await created.json();

    expect((await clients.get('contributor')!.delete(`/qc/docsets/${id}`)).status()).toBe(FORBIDDEN);
    expect((await admin.get(`/qc/docsets/${id}`)).status()).toBe(200);

    expect((await admin.delete(`/qc/docsets/${id}`)).status()).toBe(204);
    expect((await admin.get(`/qc/docsets/${id}`)).status()).toBe(HIDDEN);
  });
});

test.describe('Destructive endpoints, allow side', () => {
  test('an Admin can delete a ticket it just created', async () => {
    // Its own sacrificial ticket, so the shared fixture survives.
    const admin = clients.get('admin')!;
    const created = await admin.post('/tickets', {
      data: {
        folderId: world.folderId,
        title: 'Sacrificial ticket',
        description: '',
        ticketType: 'Bug',
        assignedToUserIds: [],
        state: 'Open',
        priority: 2,
        impact: 'Medium',
        tags: [],
      },
    });
    const { id } = await created.json();

    expect((await admin.delete(`/tickets/${id}`)).status()).toBe(204);
    expect((await admin.get(`/tickets/${id}`)).status()).toBe(HIDDEN);
  });
});

test.describe('Token handling', () => {
  test('a garbage token is rejected, not ignored', async () => {
    const client = await clientFor('not.a.real.jwt');
    expect((await client.get('/auth/me')).status()).toBe(UNAUTHENTICATED);
    await client.dispose();
  });

  test('setup cannot be re-run once an account exists', async () => {
    // /auth/setup is [AllowAnonymous] because it has to be reachable on an empty
    // database. It must stop working the moment there is an account, or anyone could
    // mint themselves an Admin.
    const client = await clientFor(null);
    const response = await client.post('/auth/setup', {
      data: { username: 'intruder', displayName: 'Intruder', password: 'intruder-123456' },
    });
    expect(response.status()).not.toBe(200);
    expect(response.status()).not.toBe(201);
    await client.dispose();
  });
});
