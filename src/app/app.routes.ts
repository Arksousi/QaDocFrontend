import { Routes } from '@angular/router';
import { accountGuard, adminGuard, authGuard, guestGuard, leaderGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    title: 'Q Desk',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/shell').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/project-menu/project-menu').then((m) => m.ProjectMenuPage),
        title: 'Q Desk',
      },
      {
        // Q Generator hub with QA Generator and QC Generator
        path: 'q',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () => import('./pages/q-home/q-home').then((m) => m.QHomePage),
            title: 'Q Desk',
          },
          {
            path: 'qa',
            loadComponent: () => import('./pages/testcases/testcases').then((m) => m.TestCasesPage),
            title: 'Q Desk',
          },
          {
            path: 'qa/:suiteId',
            loadComponent: () => import('./pages/testcases/suite').then((m) => m.SuitePage),
            title: 'Q Desk',
          },
          {
            path: 'qc',
            loadComponent: () => import('./pages/qc/qc-docsets').then((m) => m.QcDocSetsPage),
            title: 'Q Desk',
          },
          {
            path: 'qc/:docsetId',
            loadComponent: () => import('./pages/qc/qc-docset-detail').then((m) => m.QcDocSetDetailPage),
            title: 'Q Desk',
          },
        ],
      },
      {
        // Backwards compatibility redirects: /testcases -> /q/qa
        path: 'testcases',
        pathMatch: 'full',
        redirectTo: 'q/qa',
      },
      {
        path: 'testcases/:suiteId',
        redirectTo: 'q/qa/:suiteId',
      },
      {
        // Ticket Details opens as a window over this page via ?ticket=<id>, so a ticket link can be shared.
        path: 'projects/:projectId',
        loadComponent: () => import('./pages/ticket-viewer/ticket-viewer').then((m) => m.TicketViewerPage),
        title: 'Q Desk',
      },
      {
        path: 'dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Q Desk',
      },
      {
        // The two dashboards merged into one page; these old URLs open it on the tab they were.
        path: 'leader',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Q Desk',
        data: { tab: 'leader' },
      },
      {
        path: 'users-dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Q Desk',
        data: { tab: 'workload' },
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage),
        title: 'Q Desk',
      },
      {
        path: 'profile',
        canActivate: [accountGuard],
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
        title: 'Q Desk',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
