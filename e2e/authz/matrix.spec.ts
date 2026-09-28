import { APIRequestContext, expect, test } from '@playwright/test';
import { ACTORS, Actor, World, buildWorld, clientFor } from './actors';

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
    name: 'PUT /projects/{id}/members refuses the retired Manager role',
    method: 'put',
    path: (w) => `/projects/${w.projectId}/members`,
    body: (w) => ({ userId: w.userIds['viewer'], role: 'Manager' }),
    expected: { manager: 400, admin: 400 },
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

test.describe('Several people on one ticket', () => {
  interface Assignee { userId: number; assignedByName: string | null }
  const body = (assignedToUserIds: number[]) => ({
    folderId: world.folderId, title: 'Shared ticket', description: '', ticketType: 'Bug',
    assignedToUserIds, state: 'Open', priority: 2, impact: 'Medium', tags: [],
  });

  test('everyone assigned is kept and told; removing one leaves the rest', async () => {
    const admin = clients.get('admin')!;
    const pair = [world.userIds['contributor'], world.userIds['manager']];
    const { id } = await (await admin.post('/tickets', { data: body(pair) })).json();

    const assignees = async (): Promise<Assignee[]> => (await (await admin.get(`/tickets/${id}`)).json()).assignees;
    expect((await assignees()).map((a) => a.userId).sort()).toEqual([...pair].sort());

    for (const actor of ['contributor', 'manager'] as const) {
      const notes: { ticketId: number }[] = await (await clients.get(actor)!.get('/notifications?top=50')).json();
      expect(notes.some((n) => n.ticketId === id), `${actor} should have been notified`).toBe(true);
    }

    expect((await admin.put(`/tickets/${id}`, { data: body([world.userIds['manager']]) })).status()).toBe(204);
    expect((await assignees()).map((a) => a.userId)).toEqual([world.userIds['manager']]);

    // "Assigned to me" still finds a ticket the contributor shares; here they have left it.
    const mine: { ticketId: number }[] = await (await clients.get('contributor')!
      .get(`/projects/${world.projectId}/tickets?assignedTo=${world.userIds['contributor']}`)).json();
    expect(mine.some((t) => t.ticketId === id)).toBe(false);
  });

  test('a save that leaves the list out keeps everyone (an app from before several assignees)', async () => {
    const admin = clients.get('admin')!;
    const pair = [world.userIds['contributor'], world.userIds['manager']];
    const { id } = await (await admin.post('/tickets', { data: body(pair) })).json();

    const { assignedToUserIds: _omitted, ...legacy } = body([]);
    expect((await admin.put(`/tickets/${id}`, { data: { ...legacy, title: 'Edited by an old app' } })).status()).toBe(204);

    const after: Assignee[] = (await (await admin.get(`/tickets/${id}`)).json()).assignees;
    expect(after.map((a) => a.userId).sort()).toEqual([...pair].sort());
  });

  test('more than the limit is refused', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => i + 1);
    expect((await clients.get('admin')!.post('/tickets', { data: body(tooMany) })).status()).toBe(400);
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
