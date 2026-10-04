import { Routes } from '@angular/router';
import { accountGuard, adminGuard, authGuard, guestGuard, leaderGuard } from './core/auth.guards';

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
        path: 'dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · QaDoc',
      },
      {
        // The two dashboards merged into one page; these old URLs open it on the tab they were.
        path: 'leader',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · QaDoc',
        data: { tab: 'leader' },
      },
      {
        path: 'users-dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · QaDoc',
        data: { tab: 'workload' },
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage),
        title: 'Users · QaDoc',
      },
      {
        path: 'profile',
        canActivate: [accountGuard],
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
        title: 'Profile · QaDoc',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
