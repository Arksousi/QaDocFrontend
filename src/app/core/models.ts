export const STATES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed'] as const;
/** Ordered least to most severe; Showstopper sits above Critical. */
export const IMPACTS = ['Low', 'Medium', 'High', 'Critical', 'Showstopper'] as const;
export const ROLES = ['Admin', 'Member'] as const;
/** What kind of work a ticket represents. */
export const TICKET_TYPES = ['Bug', 'Enhancement'] as const;
/** Per-project access, ordered least to most capable. */
export const PROJECT_ROLES = ['Viewer', 'Contributor', 'Manager'] as const;
export const PRIORITIES = [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }] as const;

export type TicketState = (typeof STATES)[number];
export type Impact = (typeof IMPACTS)[number];
export type Role = (typeof ROLES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** What a role lets you do, so the UI can hide what the API would refuse. */
export function canEditTickets(role: ProjectRole | null | undefined): boolean {
  return role === 'Contributor' || role === 'Manager';
}

export function canManageMembers(role: ProjectRole | null | undefined): boolean {
  return role === 'Manager';
}

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
  /** First segment of every ticket key here, e.g. RMS. */
  projectCode: string;
  createdAt: string;
  createdByName: string | null;
  ticketCount: number;
  openTicketCount: number;
  lastActivity: string;
  /** The signed-in user's role in this project. Admins are reported as Manager. */
  myRole: ProjectRole | null;
}

/** A file stored outside the description (videos). The description holds only its id. */
export interface Attachment {
  attachmentId: number;
  projectId: number;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface ProjectMember {
  projectId: number;
  userId: number;
  displayName: string;
  username: string;
  role: ProjectRole;
  isActive: boolean;
  addedAt: string;
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

export interface Folder {
  folderId: number;
  projectId: number;
  folderName: string;
  /** Middle segment of a ticket key, e.g. V1. */
  folderCode: string;
  createdAt: string;
  ticketCount: number;
  openTicketCount: number;
}

export interface Ticket {
  ticketId: number;
  projectId: number;
  folderId: number;
  sequence: number;
  /** The key people quote, e.g. RMS-V1-0001. Built by the API from the codes. */
  ticketKey: string;
  folderName: string;
  folderCode: string;
  title: string;
  description: string | null;
  ticketType: TicketType;
  assignedToUserId: number | null;
  assignedToName: string | null;
  /** Who gave it to the current assignee; null while unassigned. */
  assignedByName: string | null;
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
  folderId: number;
  title: string;
  description: string;
  ticketType: TicketType;
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
