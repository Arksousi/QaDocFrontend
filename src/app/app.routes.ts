import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    title: 'Sign in · QaDoc',
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/project-menu/project-menu').then((m) => m.ProjectMenuPage),
        title: 'Projects · QaDoc',
      },
      {
        // Ticket Details opens as a window over this page via ?ticket=<id>, so a ticket link can be shared.
        path: 'projects/:projectId',
        loadComponent: () => import('./pages/ticket-viewer/ticket-viewer').then((m) => m.TicketViewerPage),
        title: 'Tickets · QaDoc',
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage),
        title: 'Users · QaDoc',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
