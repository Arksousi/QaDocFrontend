import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Project, Role, SaveTicket, Suggestions, Ticket, TicketComment, User, UserOption } from './models';

interface Created {
  id: number;
}

export interface TicketFilters {
  search?: string;
  state?: string;
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
  createProject = (projectName: string) =>
    firstValueFrom(this.http.post<Created>(`${this.base}/projects`, { projectName }));
  /** Admin only. Cascades: every ticket in the project goes with it. */
  deleteProject = (id: number) => firstValueFrom(this.http.delete<void>(`${this.base}/projects/${id}`));

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
