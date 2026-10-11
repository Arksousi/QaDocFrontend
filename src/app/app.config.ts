import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, Injectable, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy, provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor, errorInterceptor } from './core/toast.service';

@Injectable({ providedIn: 'root' })
export class QDeskTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(_snapshot: RouterStateSnapshot): void {
    this.title.setTitle('Q Desk');
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Route params (including the parent :projectId) are bound straight to component inputs.
    provideRouter(routes, withComponentInputBinding(), withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    // Always keep document / tab title as "Q Desk" only
    { provide: TitleStrategy, useClass: QDeskTitleStrategy },
    // Restore the signed-in user before the first route guard runs.
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
