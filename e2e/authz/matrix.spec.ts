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
      assignedToUserId: null,
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
      assignedToUserId: null,
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
    // Any member may comment, including a Viewer — commenting is not editing.
    expected: { anonymous: UNAUTHENTICATED, guest: FORBIDDEN, outsider: HIDDEN, viewer: 201, contributor: 201, manager: 201, admin: 201 },
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
        assignedToUserId: null,
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
      data: { userId: world.userIds['manager'], role: 'Manager' },
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
        assignedToUserId: null,
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
