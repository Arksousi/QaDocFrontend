export const STATES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed'] as const;
export const IMPACTS = ['Low', 'Medium', 'High', 'Critical'] as const;
export const ROLES = ['Admin', 'Member'] as const;
export const PRIORITIES = [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }] as const;

export type TicketState = (typeof STATES)[number];
export type Impact = (typeof IMPACTS)[number];
export type Role = (typeof ROLES)[number];

// ---------- Users & auth ----------
export interface User {
  userId: number;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Active user shown in "Assigned To" pickers. */
export interface UserOption {
  userId: number;
  displayName: string;
  username: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface AuthStatus {
  needsSetup: boolean;
}

// ---------- Projects & tickets ----------
export interface Project {
  projectId: number;
  projectName: string;
  createdAt: string;
  createdByName: string | null;
  ticketCount: number;
  openTicketCount: number;
  lastActivity: string;
}

export interface TicketComment {
  commentId: number;
  ticketId: number;
  authorUserId: number | null;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface TicketHistoryEntry {
  historyId: number;
  userName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}

export interface Ticket {
  ticketId: number;
  projectId: number;
  title: string;
  description: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  state: TicketState;
  priority: number;
  impact: Impact;
  createdAt: string;
  activityDate: string;
  createdByName: string | null;
  updatedByName: string | null;
  tags: string[];
  commentCount: number;
  projectName?: string | null;
  comments: TicketComment[];
  history: TicketHistoryEntry[];
}

/** Editable ticket fields, sent on create (with projectId) and update. */
export interface SaveTicket {
  projectId: number;
  title: string;
  description: string;
  assignedToUserId: number | null;
  state: TicketState;
  priority: number;
  impact: Impact;
  tags: string[];
}

export interface Suggestions {
  tags: string[];
}

/** CSS class suffix for a value, e.g. "In Progress" -> "in-progress". */
export function slug(value: string | number | null | undefined): string {
  return String(value ?? 'none').toLowerCase().replace(/\s+/g, '-');
}

export function initials(name: string | null | undefined): string {
  return (name ?? '').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}
