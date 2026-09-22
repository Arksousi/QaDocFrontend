import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStatus, LoginResponse, User } from './models';

const TOKEN_KEY = 'qadoc.token';

/**
 * Holds the signed-in user. The JWT lives in sessionStorage, so closing the browser tab signs you out;
 * the API re-validates the account on every request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiUrl}/auth`;

  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'Admin' && !this.isGuest());
  /** A "Continue as a guest" tour: the demo projects, read-only. The API enforces both. */
  readonly isGuest = computed(() => this.user()?.isGuest === true);
  private token: string | null = readToken();

  getToken() {
    return this.token;
  }

  /** Restores the session on page load. Never throws: an invalid token just means "signed out". */
  async restore(): Promise<void> {
    if (!this.token) return;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>(`${this.base}/me`)));
    } catch {
      this.clear();
    }
  }

  status = () => firstValueFrom(this.http.get<AuthStatus>(`${this.base}/status`));

  async login(username: string, password: string) {
    this.accept(await firstValueFrom(this.http.post<LoginResponse>(`${this.base}/login`, { username, password })));
  }

  /** Starts a read-only tour of the sample projects. No account, nothing stored server-side. */
  async continueAsGuest() {
    this.accept(await firstValueFrom(this.http.post<LoginResponse>(`${this.base}/guest`, {})));
  }

  async setup(username: string, displayName: string, password: string) {
    this.accept(await firstValueFrom(this.http.post<LoginResponse>(`${this.base}/setup`, { username, displayName, password })));
  }

  /** The server revokes the old token, so store the new one it returns. */
  async changePassword(currentPassword: string, newPassword: string) {
    this.accept(await firstValueFrom(this.http.post<LoginResponse>(`${this.base}/change-password`, { currentPassword, newPassword })));
  }

  logout(returnUrl?: string) {
    this.clear();
    this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  private accept(response: LoginResponse) {
    this.token = response.token;
    try {
      sessionStorage.setItem(TOKEN_KEY, response.token);
    } catch {
      /* storage unavailable: session lasts until page reload */
    }
    this.user.set(response.user);
  }

  private clear() {
    this.token = null;
    this.user.set(null);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
