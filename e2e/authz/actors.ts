import { APIRequestContext, request } from '@playwright/test';

/**
 * Builds the cast of users the authorization matrix runs against, and the project
 * fixtures they act on.
 *
 * Everything here talks to the API directly — no browser. A permission bug is a bug in
 * the API, and driving the UI would only test whether the UI *offers* the action, which
 * is the half that does not protect anything.
 */

export const API = process.env.QADOC_API ?? 'http://localhost:5134/api';

/** Every actor the matrix distinguishes. Order matters only for readable output. */
export const ACTORS = [
  'anonymous',   // no token at all
  'guest',       // the read-only tour; carries a token but names no account
  'outsider',    // a real account with NO membership in the project under test
  'viewer',      // ProjectAccess.Viewer
  'contributor', // ProjectAccess.Contributor
  'manager',     // ProjectAccess.Manager
  'admin',       // the global Admin role
] as const;

export type Actor = (typeof ACTORS)[number];

const PASSWORD = 'test-password-123';

export interface World {
  tokens: Record<Actor, string | null>;
  /** The project every non-outsider actor is a member of. */
  projectId: number;
  /** A second project ONLY admin can reach — the target for cross-project checks. */
  otherProjectId: number;
  otherTicketId: number;
  folderId: number;
  ticketId: number;
  userIds: Record<string, number>;
}

/** An authenticated (or anonymous) API client for one actor. */
export async function clientFor(token: string | null): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function tokenFor(admin: APIRequestContext, username: string): Promise<string> {
  const response = await admin.post('/auth/login', { data: { username, password: PASSWORD } });
  if (!response.ok()) throw new Error(`Could not sign in as ${username}: ${response.status()}`);
  return (await response.json()).token;
}

/**
 * Creates the whole world. Safe to call against the throwaway database only — it writes
 * users, projects, folders and tickets.
 */
export async function buildWorld(): Promise<World> {
  const anon = await clientFor(null);

  // Refuse to run anywhere that is not the local test stack. An authorization suite
  // creates accounts and projects; pointed at production it would be an incident.
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
    throw new Error(`Refusing to build fixtures against a non-local API: ${API}`);
  }

  // --- bootstrap the admin -------------------------------------------------
  const status = await anon.get('/auth/status');
  const { needsSetup } = await status.json();
  const stamp = Date.now();
  const adminName = needsSetup ? 'authz.admin' : `authz.admin.${stamp}`;

  let adminToken: string;
  if (needsSetup) {
    // A fresh database: the very first account is created without credentials, which is
    // itself worth knowing — /auth/setup is anonymous and must stop working afterwards.
    const created = await anon.post('/auth/setup', {
      data: { username: adminName, displayName: 'Authz Admin', password: PASSWORD },
    });
    adminToken = (await created.json()).token;
  } else {
    adminToken = await tokenFor(anon, 'authz.admin');
  }

  const admin = await clientFor(adminToken);

  // --- the other actors ----------------------------------------------------
  const userIds: Record<string, number> = {};
  const make = async (key: string) => {
    const username = `authz.${key}.${stamp}`;
    const response = await admin.post('/users', {
      data: { username, displayName: `Authz ${key}`, password: PASSWORD, role: 'Tester' },
    });
    if (!response.ok()) throw new Error(`Could not create ${key}: ${response.status()}`);
    userIds[key] = (await response.json()).id;
    return { key, username };
  };

  const people = [await make('outsider'), await make('viewer'), await make('contributor'), await make('manager')];

  // --- projects ------------------------------------------------------------
  const newProject = async (name: string, code: string) => {
    const response = await admin.post('/projects', { data: { projectName: name, projectCode: code } });
    if (!response.ok()) throw new Error(`Could not create project ${code}: ${response.status()}`);
    return (await response.json()).id as number;
  };

  const projectId = await newProject(`Authz Target ${stamp}`, `AZ${stamp % 10000}`);
  const otherProjectId = await newProject(`Authz Other ${stamp}`, `OT${stamp % 10000}`);

  // Membership: everyone except the outsider, who is deliberately left with none.
  for (const role of ['Viewer', 'Contributor', 'Manager'] as const) {
    const person = people.find((p) => p.key === role.toLowerCase())!;
    const response = await admin.put(`/projects/${projectId}/members`, {
      data: { userId: userIds[person.key], role },
    });
    if (!response.ok()) throw new Error(`Could not add ${person.key}: ${response.status()}`);
  }

  // --- something to read and write ----------------------------------------
  const folders = await admin.get(`/projects/${projectId}/folders`);
  const folderId = (await folders.json())[0].folderId;

  const ticket = await admin.post('/tickets', {
    data: {
      folderId,
      title: 'Authorization fixture ticket',
      description: '',
      ticketType: 'Bug',
      assignedToUserId: null,
      state: 'Open',
      priority: 2,
      impact: 'Medium',
      tags: [],
    },
  });
  const ticketId = (await ticket.json()).id as number;

  const otherFolders = await admin.get(`/projects/${otherProjectId}/folders`);
  const otherTicket = await admin.post('/tickets', {
    data: {
      folderId: (await otherFolders.json())[0].folderId,
      title: 'Ticket in a project nobody else belongs to',
      description: '',
      ticketType: 'Bug',
      assignedToUserId: null,
      state: 'Open',
      priority: 2,
      impact: 'Medium',
      tags: [],
    },
  });
  const otherTicketId = (await otherTicket.json()).id as number;

  // --- tokens --------------------------------------------------------------
  const guest = await anon.post('/auth/guest', { data: {} });

  return {
    tokens: {
      anonymous: null,
      guest: (await guest.json()).token,
      outsider: await tokenFor(anon, people.find((p) => p.key === 'outsider')!.username),
      viewer: await tokenFor(anon, people.find((p) => p.key === 'viewer')!.username),
      contributor: await tokenFor(anon, people.find((p) => p.key === 'contributor')!.username),
      manager: await tokenFor(anon, people.find((p) => p.key === 'manager')!.username),
      admin: adminToken,
    },
    projectId,
    otherProjectId,
    otherTicketId,
    folderId,
    ticketId,
    userIds,
  };
}
