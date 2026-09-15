import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(message: string) {
    this.push('success', message);
  }

  error(message: string) {
    this.push('error', message);
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], message: string) {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 3000);
  }
}

/** Adds the bearer token to QaDoc API calls. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (!token || !req.url.startsWith(environment.apiUrl)) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/** Turns API failures into a readable toast; an expired or revoked session sends you back to Login. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toasts = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = /\/auth\/(login|setup|me|status)$/.test(req.url);
      if (err.status === 401 && !isAuthCall) {
        if (auth.user()) toasts.error('Your session has ended. Please sign in again.');
        auth.logout(router.url.startsWith('/login') ? undefined : router.url);
      } else if (!req.url.endsWith('/auth/me')) {
        toasts.error(describeError(err));
      }
      return throwError(() => err);
    }),
  );
};

function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Cannot reach the QaDoc API. Is the backend running on port 5134?';
  if (err.status === 403) return 'Only an Admin can do that.';
  const body = err.error;
  if (body?.errors && Object.keys(body.errors).length) {
    return [...new Set(Object.values(body.errors as Record<string, string[]>).flat())].join(' ');
  }
  return body?.detail || body?.title || body?.message || `Request failed (${err.status}).`;
}
