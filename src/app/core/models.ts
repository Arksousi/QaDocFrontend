export const STATES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed'] as const;
/** Ordered least to most severe; Showstopper sits above Critical. */
export const IMPACTS = ['Low', 'Medium', 'High', 'Critical', 'Showstopper'] as const;
/**
 * What someone is across the app. Admin manages everything; Leader may create projects and sees
 * the Leader Dashboard. Neither Developer nor Tester grants anything on its own; see PROJECT_ROLES.
 */
export const ROLES = ['Admin', 'Leader', 'Developer', 'Tester'] as const;
/** What kind of work a ticket represents. */
export const TICKET_TYPES = ['Bug', 'Enhancement', 'Issue'] as const;
/** What a membership can be set to, least to most capable. Managing is not one of them; see ProjectAccess. */
export const PROJECT_ROLES = ['Viewer', 'Contributor'] as const;
export const PRIORITIES = [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }] as const;
/** 1 is the most urgent. Named for the ticket list's priority marker and its tooltip. */
export const PRIORITY_LABELS: Record<number, string> = { 1: 'Highest', 2: 'High', 3: 'Medium', 4: 'Low' };

export type TicketState = (typeof STATES)[number];
export type Impact = (typeof IMPACTS)[number];
export type Role = (typeof ROLES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type ProjectRole = (typeof PROJECT_ROLES)[number];
/**
 * What the API reports you may do on a project. Manager is never stored: it is an Admin, or a
 * Leader who is a Contributor there.
 */
export type ProjectAccess = ProjectRole | 'Manager';

/** What a role lets you do, so the UI can hide what the API would refuse. */
export function canEditTickets(role: ProjectAccess | string | null | undefined): boolean {
  return role === 'Contributor' || role === 'Manager';
}

export function canManageMembers(role: ProjectAccess | null | undefined): boolean {
  return role === 'Manager';
}

// ---------- Users & auth ----------
export interface User {
  userId: number;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  /** True on a guest tour: sample data only, and every write is refused by the API. */
  isGuest?: boolean;
  /** Unfinished tickets they should hold at once, across all projects; null for no limit. */
  ticketLimit: number | null;
  createdAt: string;
  // The profile they fill in themselves; all optional.
  email?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  bio?: string | null;
  /** 0 while they have no picture; goes up each time it changes. */
  avatarVersion?: number;
}

/** Active user shown in "Assigned To" pickers, with their load so the picker can warn. */
export interface UserOption {
  userId: number;
  displayName: string;
  username: string;
  /** Tickets assigned to them, in any real project, that are not Closed. */
  openTickets: number;
  ticketLimit: number | null;
}

/** What an Admin or Leader sees on hovering someone's avatar. Counts cover every real project. */
/** Your own profile fields, as PUT /profile takes them. Blank means not given. */
export interface ProfileUpdate {
  displayName: string;
  email: string | null;
  jobTitle: string | null;
  phone: string | null;
  bio: string | null;
}

/** Someone who has a profile picture, and which version of it is current. */
export interface AvatarVersion {
  userId: number;
  version: number;
}

export interface UserCard {
  userId: number;
  displayName: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  ticketLimit: number | null;
  openTickets: number;
  closedTickets: number;
  totalAssigned: number;
  /** Only projects the viewer can open too. */
  projects: { projectId: number; projectCode: string; projectName: string; role: ProjectRole }[];
  jobTitle?: string | null;
  email?: string | null;
  avatarVersion?: number;
}

/** One row of the Users Dashboard: an active person's load against their limit. */
export interface UserWorkload {
  userId: number;
  displayName: string;
  username: string;
  role: Role;
  openTickets: number;
  ticketLimit: number | null;
}

/**
 * Whether holding `extra` more tickets would take someone past their limit. A guide only: the
 * app warns and the API accepts it anyway. No limit means never.
 */
export function overLimit(openTickets: number, ticketLimit: number | null | undefined, extra = 0): boolean {
  return ticketLimit != null && openTickets + extra > ticketLimit;
}

/** "4/5", or just "4 open" for someone without a limit. */
export function loadLabel(openTickets: number, ticketLimit: number | null | undefined): string {
  return ticketLimit != null ? `${openTickets}/${ticketLimit}` : `${openTickets} open`;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

/** "actorName assigned ticketKey to you", for the bell. */
export interface AppNotification {
  notificationId: number;
  ticketId: number;
  projectId: number;
  ticketKey: string;
  title: string;
  actorName: string | null;
  createdAt: string;
  isRead: boolean;
  /**
   * Assigned: they were put on the ticket. Mentioned: a comment on it @mentions them.
   * Retest: a ticket they are on was moved to Retest.
   */
  kind: 'Assigned' | 'Mentioned' | 'Retest';
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
  /** What the signed-in user may do here. Admins, and Leaders who contribute, are reported as Manager. */
  myRole: ProjectAccess | null;
}

/**
 * A member's share of a project's tickets, for the Leader Dashboard. Finished means Closed, the same
 * line the project's open count draws.
 */
export interface MemberScore {
  userId: number;
  displayName: string;
  role: ProjectRole;
  isActive: boolean;
  /** This project only. */
  assigned: number;
  closed: number;
  /** Their load across every project, measured against ticketLimit. */
  openTickets: number;
  ticketLimit: number | null;
}

export interface ProjectScoreboard extends Project {
  members: MemberScore[];
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
  /** Their account role. A Leader holding Contributor is who manages the project. */
  userRole: Role;
  /** Worked out by the API: an active Leader who is a Contributor here. */
  canManage: boolean;
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
  /** People the comment @mentions; "@DisplayName" in the text is highlighted for each. */
  mentions: { userId: number; displayName: string }[];
}

/**
 * Splits comment text into plain runs and @mentions, so the template can highlight the mentions
 * without rendering any HTML from the text. Only names the comment actually recorded count: an "@"
 * someone merely typed stays plain. Longest names first, so "@Ann Lee" wins over "@Ann".
 */
export function mentionSegments(text: string, mentions: { displayName: string }[]): { text: string; mention: boolean }[] {
  const names = [...new Set(mentions.map((m) => m.displayName))].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text, mention: false }];
  const pattern = new RegExp(`(${names.map((n) => '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(pattern).filter((part) => part !== '').map((part) => ({ text: part, mention: names.some((n) => part === '@' + n) }));
}

export interface TicketHistoryEntry {
  historyId: number;
  userId: number | null;
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

/** One hit from the top-bar global search: enough to show what matched and where it lives. */
export interface TicketSearchResult {
  ticketId: number;
  projectId: number;
  projectName: string;
  /** e.g. RMS-V1-0007, assembled by the API. */
  ticketKey: string;
  title: string;
  state: TicketState;
  ticketType: TicketType;
  activityDate: string;
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
  /** Everyone working on it, in the order they were added. Empty while unassigned. */
  assignees: TicketAssignee[];
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

/** One person a ticket is assigned to, and who put them there. */
export interface TicketAssignee {
  userId: number;
  displayName: string;
  assignedByName: string | null;
  /** Who assigned them, for their avatar; null when unknown. */
  assignedByUserId?: number | null;
}

/** Editable ticket fields, sent on create (with projectId) and update. */
export interface SaveTicket {
  folderId: number;
  title: string;
  description: string;
  ticketType: TicketType;
  /** Empty means unassigned. */
  assignedToUserIds: number[];
  state: TicketState;
  priority: number;
  impact: Impact;
  tags: string[];
}

/**
 * A saved ticket as the body its update takes: every field as it is now. The list's quick state
 * change sends this with only the state changed, so it never touches anything else.
 */
export function toSaveTicket(t: Ticket): SaveTicket {
  return {
    folderId: t.folderId, title: t.title, description: t.description ?? '', ticketType: t.ticketType,
    assignedToUserIds: t.assignees.map((a) => a.userId), state: t.state, priority: t.priority, impact: t.impact, tags: [...t.tags],
  };
}

export interface Suggestions {
  tags: string[];
}

// ---------- Test Case Generator ----------

/** The four buckets a test case can be filed under, in the order the table shows them. */
export const TEST_CATEGORIES = ['Functional', 'Negative', 'Boundary', 'UI'] as const;
export type TestCaseCategory = (typeof TEST_CATEGORIES)[number];

/**
 * Screenshots one suite may hold, matching TestCaseGenerator:MaxImages on the server, which is
 * what actually refuses the upload. The dialog shows it so nobody has to find that out.
 */
export const MAX_SUITE_IMAGES = 10;

/** Draft is where every new case lands, however it arrived. */
export const TEST_STATUSES = ['Draft', 'Approved', 'Passed', 'Failed'] as const;
export type TestCaseStatus = (typeof TEST_STATUSES)[number];

/** Who wrote the case: a vision model, a pasted import, or a person. */
export type TestCaseSource = 'Ai' | 'Imported' | 'Manual';

/** One screenshot. The bytes live in attachment storage, so an <img> fetches them through it. */
export interface TestSuiteScreen {
  screenId: number;
  suiteId: number;
  attachmentId: number;
  sortOrder: number;
  contentType: string;
  byteSize: number;
}

export interface TestCase {
  testCaseId: number;
  suiteId: number;
  /** Counter within the suite; the number the key is built from. */
  number: number;
  caseKey: string;
  title: string;
  category: TestCaseCategory;
  priority: number;
  preconditions: string;
  steps: string[];
  expected: string;
  status: TestCaseStatus;
  linkedTicketId: number | null;
  linkedTicketKey: string | null;
  source: TestCaseSource;
  createdAt: string;
}

/** A suite of screenshots and the cases drawn from them. The detail response fills screens and cases. */
export interface TestSuite {
  suiteId: number;
  projectId: number;
  folderId: number | null;
  title: string;
  businessDescription: string | null;
  createdByUserId: number | null;
  createdByName: string | null;
  createdAt: string;
  isDemo: boolean;
  screenCount: number;
  caseCount: number;
  projectName: string;
  projectCode: string;
  folderName: string;
  /** What the caller may do in the suite's project, so the UI can hide what they cannot do. */
  myRole: string | null;
  screens: TestSuiteScreen[];
  cases: TestCase[];
}

// ---------- QC Generator (Product Documentation & User Manual) ----------

export const MAX_QC_DOCSET_IMAGES = 30;

export type QcDocumentKind = 'Documentation' | 'UserManual';
export type QcDocumentStatus = 'Draft' | 'Approved';
export type QcDocumentSource = 'Ai' | 'Imported' | 'Manual';

export interface QcDocScreen {
  screenId: number;
  id?: number;
  docSetId: number;
  sortOrder: number;
  caption: string | null;
  attachmentId: number;
  screenSummary: string | null;
  contentType: string;
  byteSize: number;
}

export interface QcDocument {
  documentId: number;
  id?: number;
  docSetId: number;
  kind: QcDocumentKind;
  version: number;
  markdown: string;
  status: QcDocumentStatus;
  source: QcDocumentSource;
  generatedBy: number | null;
  generatedByName: string | null;
  createdAt: string;
}

export interface QcDocSet {
  docSetId: number;
  id?: number;
  projectId: number;
  title: string;
  appName: string;
  businessDescription: string | null;
  language: string;
  logoAttachmentId: number | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  isDemo: boolean;
  screenCount: number;
  documentCount: number;
  myRole: ProjectAccess | null;
  projectName: string;
  projectCode: string;
  screens: QcDocScreen[];
  documents: QcDocument[];
}

export interface QcJobStatus {
  jobId: string;
  docSetId: number;
  kind: QcDocumentKind;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed';
  progress: string;
  currentStep: number;
  totalSteps: number;
  error: string | null;
  documentId: number | null;
}

/** CSS class suffix for a value, e.g. "In Progress" -> "in-progress". */
export function slug(value: string | number | null | undefined): string {
  return String(value ?? 'none').toLowerCase().replace(/\s+/g, '-');
}

export function initials(name: string | null | undefined): string {
  return (name ?? '').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** How many `.avatar-t*` tones `styles.css` defines. */
const AVATAR_TONES = 8;

/**
 * Picks one of the eight avatar tones from the name itself, so the same person is the same colour
 * on every page and in every session without the server storing one. Every avatar used to be the
 * same purple, which made a column of them one indistinguishable stripe.
 *
 * Deterministic and case-insensitive; the hash only has to spread names across eight buckets, so
 * a plain rolling sum is enough.
 */
export function avatarTone(name: string | null | undefined): number {
  const key = (name ?? '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  return hash % AVATAR_TONES;
}
