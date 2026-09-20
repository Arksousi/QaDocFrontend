import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Attachment, Folder, Project, ProjectMember, ProjectRole, Role, SaveTicket, Suggestions, Ticket, TicketComment, User, UserOption } from './models';

interface Created {
  id: number;
}

export interface TicketFilters {
  folderId?: number | null;
  search?: string;
  state?: string;
  type?: string;
  tag?: string;
  assignedTo?: number | null;
}

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

  // Project members (Admins anywhere; Managers on their own project)
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
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return firstValueFrom(this.http.get<Ticket[]>(`${this.base}/projects/${projectId}/tickets`, { params }));
  }
  suggestions = (projectId: number) =>
    firstValueFrom(this.http.get<Suggestions>(`${this.base}/projects/${projectId}/suggestions`));

  // Tickets
  ticket = (id: number) => firstValueFrom(this.http.get<Ticket>(`${this.base}/tickets/${id}`));
  createTicket = (t: SaveTicket) => firstValueFrom(this.http.post<Created>(`${this.base}/tickets`, t));
  updateTicket = (id: number, t: SaveTicket) => firstValueFrom(this.http.put<void>(`${this.base}/tickets/${id}`, t));
  deleteTicket = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/tickets/${id}`));
  addComment = (ticketId: number, text: string) =>
    firstValueFrom(this.http.post<TicketComment>(`${this.base}/tickets/${ticketId}/comments`, { text }));

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

  // Users
  userOptions = () => firstValueFrom(this.http.get<UserOption[]>(`${this.base}/users/options`));
  users = () => firstValueFrom(this.http.get<User[]>(`${this.base}/users`));
  createUser = (u: { username: string; displayName: string; password: string; role: Role }) =>
    firstValueFrom(this.http.post<Created>(`${this.base}/users`, u));
  updateUser = (id: number, u: { displayName: string; role: Role; isActive: boolean }) =>
    firstValueFrom(this.http.put<void>(`${this.base}/users/${id}`, u));
  resetPassword = (id: number, newPassword: string) =>
    firstValueFrom(this.http.post<void>(`${this.base}/users/${id}/reset-password`, { newPassword }));
}
