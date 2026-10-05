import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { quiet } from './toast.service';
import { AppNotification, Attachment, AvatarVersion, Folder, ProfileUpdate, Project, ProjectMember, ProjectRole, ProjectScoreboard, QcDocScreen, QcDocSet, QcDocument, QcJobStatus, Role, SaveTicket, Suggestions, TestCase, TestSuite, Ticket, TicketComment, TicketSearchResult, User, UserCard, UserOption, UserWorkload } from './models';

interface Created {
  id: number;
}

export interface TicketFilters {
  folderId?: number | null;
  search?: string;
  /** Any of these states; empty means every state. Sent as a repeated "state" parameter. */
  states?: string[];
  /** Any of these types; empty means every type. */
  types?: string[];
  /** A ticket carrying any one of these tags matches; empty means every tag. */
  tags?: string[];
  assignedTo?: number | null;
}

/** The API names its repeatable filters in the singular: ?state=Open&state=Retest. */
const REPEATED_AS: Record<string, string> = { states: 'state', types: 'type', tags: 'tag' };

/** Thin promise-based wrapper over the QaDoc REST API. Errors are surfaced globally by the error interceptor. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // Project Menu
  projects = () => firstValueFrom(this.http.get<Project[]>(`${this.base}/projects`));
  recentProjects = (top = 5) =>
    firstValueFrom(this.http.get<Project[]>(`${this.base}/projects/recent`, { params: { top } }));
  project = (id: number) => firstValueFrom(this.http.get<Project>(`${this.base}/projects/${id}`));
  /** Admins and Leaders only, like creating a project. */
  scoreboard = () => firstValueFrom(this.http.get<ProjectScoreboard[]>(`${this.base}/projects/scoreboard`));
  createProject = (projectName: string, projectCode: string) =>
    firstValueFrom(this.http.post<Created>(`${this.base}/projects`, { projectName, projectCode }));

  // Folders (the layer between a project and its tickets)
  folders = (projectId: number) =>
    firstValueFrom(this.http.get<Folder[]>(`${this.base}/projects/${projectId}/folders`));
  createFolder = (projectId: number, folderName: string, folderCode: string) =>
    firstValueFrom(this.http.post<Created>(`${this.base}/projects/${projectId}/folders`, { folderName, folderCode }));
  updateFolder = (projectId: number, folderId: number, folderName: string, folderCode: string) =>
    firstValueFrom(this.http.put<void>(`${this.base}/projects/${projectId}/folders/${folderId}`, { folderName, folderCode }));
  deleteFolder = (projectId: number, folderId: number) =>
    firstValueFrom(this.http.delete<void>(`${this.base}/projects/${projectId}/folders/${folderId}`));
  /** Admin only. Cascades: every ticket in the project goes with it. */
  deleteProject = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/projects/${id}`));

  // Sample data for the guest tour. Admin only: these projects are hidden from every normal list.
  demoProjects = () => firstValueFrom(this.http.get<Project[]>(`${this.base}/projects/demo`));
  setProjectDemo = (id: number, isDemo: boolean) =>
    firstValueFrom(this.http.put<void>(`${this.base}/projects/${id}/demo`, { isDemo }));

  // Project members (Admins anywhere; Leaders on projects they contribute to)
  projectMembers = (id: number) =>
    firstValueFrom(this.http.get<ProjectMember[]>(`${this.base}/projects/${id}/members`));
  saveProjectMember = (id: number, userId: number, role: ProjectRole) =>
    firstValueFrom(this.http.put<void>(`${this.base}/projects/${id}/members`, { userId, role }));
  removeProjectMember = (id: number, userId: number) =>
    firstValueFrom(this.http.delete<void>(`${this.base}/projects/${id}/members/${userId}`));

  // Ticket Viewer
  tickets(projectId: number, filters: TicketFilters) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      // A set goes out as one repeated parameter, which is what the API binds to.
      if (Array.isArray(value)) {
        for (const item of value) params = params.append(REPEATED_AS[key] ?? key, item);
      } else if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return firstValueFrom(this.http.get<Ticket[]>(`${this.base}/projects/${projectId}/tickets`, { params }));
  }
  /** Only Contributors and Admins: the API refuses anyone else as an assignee. */
  projectAssignees = (projectId: number) =>
    firstValueFrom(this.http.get<UserOption[]>(`${this.base}/projects/${projectId}/assignees`));
  suggestions = (projectId: number) =>
    firstValueFrom(this.http.get<Suggestions>(`${this.base}/projects/${projectId}/suggestions`));

  // Tickets
  ticket = (id: number) => firstValueFrom(this.http.get<Ticket>(`${this.base}/tickets/${id}`));
  /** Top-bar global search across every project the caller can see; the API wants 2+ characters. */
  searchTickets = (q: string) =>
    firstValueFrom(this.http.get<TicketSearchResult[]>(`${this.base}/tickets/search`, { params: { q } }));
  createTicket = (t: SaveTicket) => firstValueFrom(this.http.post<Created>(`${this.base}/tickets`, t));
  updateTicket = (id: number, t: SaveTicket) => firstValueFrom(this.http.put<void>(`${this.base}/tickets/${id}`, t));
  deleteTicket = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/tickets/${id}`));
  /** Each id in mentionedUserIds is notified; the API drops anyone who is not a Contributor there. */
  addComment = (ticketId: number, text: string, mentionedUserIds: number[] = []) =>
    firstValueFrom(this.http.post<TicketComment>(`${this.base}/tickets/${ticketId}/comments`, { text, mentionedUserIds }));

  // Attachments (videos). Uploaded separately from the ticket, then referenced by id.
  uploadAttachment(projectId: number, file: File) {
    const body = new FormData();
    body.append('projectId', String(projectId));
    body.append('file', file);
    return firstValueFrom(this.http.post<Attachment>(`${this.base}/attachments`, body));
  }

  /**
   * A <video src> cannot send an Authorization header, so the token rides in the query string.
   * Built fresh at render time and never stored in the ticket.
   */
  attachmentUrl = (attachmentId: number, token: string | null) =>
    `${this.base}/attachments/${attachmentId}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;

  // Notifications (always the caller's own)
  notifications = (top = 20) =>
    firstValueFrom(this.http.get<AppNotification[]>(`${this.base}/notifications`, { params: { top } }));
  /** Polled in the background, so failures stay quiet instead of toasting every minute. */
  unreadCount = () =>
    firstValueFrom(this.http.get<{ count: number }>(`${this.base}/notifications/unread-count`, { context: quiet() }));
  markNotificationRead = (id: number) =>
    firstValueFrom(this.http.post<void>(`${this.base}/notifications/${id}/read`, {}));
  markAllNotificationsRead = () => firstValueFrom(this.http.post<void>(`${this.base}/notifications/read-all`, {}));

  // Users
  userOptions = () => firstValueFrom(this.http.get<UserOption[]>(`${this.base}/users/options`));
  users = () => firstValueFrom(this.http.get<User[]>(`${this.base}/users`));
  createUser = (u: { username: string; displayName: string; password: string; role: Role; ticketLimit: number | null }) =>
    firstValueFrom(this.http.post<Created>(`${this.base}/users`, u));
  updateUser = (id: number, u: { displayName: string; role: Role; isActive: boolean; ticketLimit: number | null }) =>
    firstValueFrom(this.http.put<void>(`${this.base}/users/${id}`, u));
  /** The avatar hover card. Admins and Leaders. */
  userCard = (id: number) => firstValueFrom(this.http.get<UserCard>(`${this.base}/users/${id}/card`, { context: quiet() }));

  // Profile: always your own. Pictures are fetched as blobs because an <img> cannot send the token.
  updateProfile = (p: ProfileUpdate) => firstValueFrom(this.http.put<User>(`${this.base}/profile`, p));
  uploadAvatar(picture: Blob) {
    const form = new FormData();
    form.append('file', picture, 'avatar.webp');
    return firstValueFrom(this.http.post<{ avatarVersion: number }>(`${this.base}/profile/avatar`, form));
  }
  deleteAvatar = () => firstValueFrom(this.http.delete<{ avatarVersion: number }>(`${this.base}/profile/avatar`));
  avatarVersions = () => firstValueFrom(this.http.get<AvatarVersion[]>(`${this.base}/users/avatars`, { context: quiet() }));
  avatarBlob = (userId: number, version: number) =>
    firstValueFrom(this.http.get(`${this.base}/users/${userId}/avatar`, { params: { v: version }, responseType: 'blob', context: quiet() }));
  /** Users Dashboard. Admins and Leaders. */
  userWorkload = () => firstValueFrom(this.http.get<UserWorkload[]>(`${this.base}/users/workload`));
  /** Admin only. null clears the limit. */
  setTicketLimit = (id: number, ticketLimit: number | null) =>
    firstValueFrom(this.http.put<void>(`${this.base}/users/${id}/ticket-limit`, { ticketLimit }));
  resetPassword = (id: number, newPassword: string) =>
    firstValueFrom(this.http.post<void>(`${this.base}/users/${id}/reset-password`, { newPassword }));

  // Test Case Generator
  testSuites = (projectId: number) =>
    firstValueFrom(this.http.get<TestSuite[]>(`${this.base}/projects/${projectId}/testsuites`));
  testSuite = (id: number) => firstValueFrom(this.http.get<TestSuite>(`${this.base}/testsuites/${id}`));
  /** Multipart: title, description, then one "images" part per screenshot. */
  createTestSuite = (projectId: number, title: string, description: string, images: File[]) => {
    const body = new FormData();
    body.append('title', title);
    body.append('description', description);
    for (const image of images) body.append('images', image);
    return firstValueFrom(this.http.post<Created>(`${this.base}/projects/${projectId}/testsuites`, body));
  };
  deleteTestSuite = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/testsuites/${id}`));
  /** Calls the configured provider and saves the reply as Draft. */
  generateTestCases = (id: number, options: GenerateCasesOptions = {}) =>
    firstValueFrom(this.http.post<TestCase[]>(`${this.base}/testsuites/${id}/generate`, options));
  /** The manual route: JSON pasted from any chat AI, saved as Draft with source Imported. */
  importTestCases = (id: number, json: string) =>
    firstValueFrom(this.http.post<TestCase[]>(`${this.base}/testsuites/${id}/import`, { json }));
  testSuitePrompt = (id: number, maxCases?: number) =>
    firstValueFrom(
      this.http.get<{ prompt: string }>(
        `${this.base}/testsuites/${id}/prompt`,
        maxCases ? { params: { maxCases } } : {},
      ),
    );
  updateTestCase = (id: number, patch: TestCasePatch) =>
    firstValueFrom(this.http.put<void>(`${this.base}/testcases/${id}`, patch));
  deleteTestCase = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/testcases/${id}`));
  /** Turns a case into a Bug through the ordinary ticket creation path, then links the two. */
  createTicketFromTestCase = (id: number) =>
    firstValueFrom(this.http.post<{ id: number; ticketKey: string }>(`${this.base}/testcases/${id}/create-ticket`, {}));

  // QC Generator (Product Documentation & User Manual)
  qcDocSets = (projectId: number) =>
    firstValueFrom(this.http.get<QcDocSet[]>(`${this.base}/projects/${projectId}/qc/docsets`));
  qcDocSet = (id: number) =>
    firstValueFrom(this.http.get<QcDocSet>(`${this.base}/qc/docsets/${id}`));
  createQcDocSet = (
    projectId: number,
    title: string,
    appName: string,
    description: string,
    language: string,
    logo: File | null,
    images: File[],
    captions: string[],
  ) => {
    const body = new FormData();
    body.append('title', title);
    body.append('appName', appName);
    body.append('description', description);
    body.append('language', language);
    if (logo) body.append('logo', logo);
    for (const image of images) body.append('images', image);
    for (const caption of captions) body.append('captions', caption);
    return firstValueFrom(this.http.post<Created>(`${this.base}/projects/${projectId}/qc/docsets`, body));
  };
  updateQcDocSet = (id: number, data: { title?: string; appName?: string; description?: string; language?: string }, logo?: File | null) => {
    const body = new FormData();
    if (data.title != null) body.append('title', data.title);
    if (data.appName != null) body.append('appName', data.appName);
    if (data.description != null) body.append('description', data.description);
    if (data.language != null) body.append('language', data.language);
    if (logo) body.append('logo', logo);
    return firstValueFrom(this.http.put<void>(`${this.base}/qc/docsets/${id}`, body));
  };
  deleteQcDocSet = (id: number) =>
    firstValueFrom(this.http.delete<void>(`${this.base}/qc/docsets/${id}`));
  reorderQcScreens = (id: number, screens: { screenId: number; sortOrder: number; caption?: string | null }[]) =>
    firstValueFrom(this.http.put<void>(`${this.base}/qc/docsets/${id}/screens/order`, { screens }));
  addQcScreens = (id: number, images: File[], captions: string[]) => {
    const body = new FormData();
    for (const img of images) body.append('images', img);
    for (const cap of captions) body.append('captions', cap);
    return firstValueFrom(this.http.post<QcDocScreen[]>(`${this.base}/qc/docsets/${id}/screens`, body));
  };
  deleteQcScreen = (docSetId: number, screenId: number) =>
    firstValueFrom(this.http.delete<void>(`${this.base}/qc/docsets/${docSetId}/screens/${screenId}`));
  generateQcDocument = (id: number, kind: string, reReadScreens = false) =>
    firstValueFrom(this.http.post<{ jobId: string }>(`${this.base}/qc/docsets/${id}/generate`, { kind, reReadScreens }));
  qcJobStatus = (jobId: string) =>
    firstValueFrom(this.http.get<QcJobStatus>(`${this.base}/qc/jobs/${jobId}`));
  qcDocument = (id: number) =>
    firstValueFrom(this.http.get<QcDocument>(`${this.base}/qc/documents/${id}`));
  updateQcDocument = (id: number, patch: { markdown?: string; status?: string }) =>
    firstValueFrom(this.http.put<void>(`${this.base}/qc/documents/${id}`, patch));
  importQcDocument = (id: number, kind: string, markdown: string) =>
    firstValueFrom(this.http.post<QcDocument>(`${this.base}/qc/docsets/${id}/import`, { kind, markdown }));
  qcDocSetPrompt = (id: number, kind?: string) =>
    firstValueFrom(this.http.get<{ prompt: string }>(`${this.base}/qc/docsets/${id}/prompt`, { params: kind ? { kind } : {} }));
  downloadQcExport = async (id: number, format: 'docx' | 'md' | 'html', appName: string, kind: string, version: number) => {
    const res = await firstValueFrom(this.http.get(`${this.base}/qc/documents/${id}/export`, {
      params: { format },
      responseType: 'blob',
    }));
    const url = window.URL.createObjectURL(res);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName.toLowerCase().replace(/\s+/g, '_')}_${kind.toLowerCase()}_v${version}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };
}

/** What one call to "Generate with AI" may ask for; every field is optional on the server too. */
export interface GenerateCasesOptions {
  maxCases?: number;
  categories?: string[];
  language?: string;
}

/** Only the fields PUT /api/testcases/{id} understands; anything left out stays as it is. */
export interface TestCasePatch {
  title?: string;
  category?: string;
  priority?: number;
  preconditions?: string;
  steps?: string[];
  expected?: string;
  status?: string;
}
