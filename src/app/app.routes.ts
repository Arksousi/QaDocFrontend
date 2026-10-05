import { Routes } from '@angular/router';
import { accountGuard, adminGuard, authGuard, guestGuard, leaderGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    title: 'Sign in · Q Desk',
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        // The launcher: what you land on after signing in, before choosing an app.
        path: 'home',
        loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
        title: 'Home · Q Desk',
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/project-menu/project-menu').then((m) => m.ProjectMenuPage),
        title: 'Projects · Q Desk',
      },
      {
        // Q Generator hub with QA Generator and QC Generator
        path: 'q',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () => import('./pages/q-home/q-home').then((m) => m.QHomePage),
            title: 'Q Generator · Q Desk',
          },
          {
            path: 'qa',
            loadComponent: () => import('./pages/testcases/testcases').then((m) => m.TestCasesPage),
            title: 'QA Generator · Q Desk',
          },
          {
            path: 'qa/:suiteId',
            loadComponent: () => import('./pages/testcases/suite').then((m) => m.SuitePage),
            title: 'QA Suite · Q Desk',
          },
          {
            path: 'qc',
            loadComponent: () => import('./pages/qc/qc-docsets').then((m) => m.QcDocSetsPage),
            title: 'QC Generator · Q Desk',
          },
          {
            path: 'qc/:docsetId',
            loadComponent: () => import('./pages/qc/qc-docset-detail').then((m) => m.QcDocSetDetailPage),
            title: 'QC Doc Set · Q Desk',
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
        title: 'Tickets · Q Desk',
      },
      {
        path: 'dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · Q Desk',
      },
      {
        // The two dashboards merged into one page; these old URLs open it on the tab they were.
        path: 'leader',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · Q Desk',
        data: { tab: 'leader' },
      },
      {
        path: 'users-dashboard',
        canActivate: [leaderGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Dashboard · Q Desk',
        data: { tab: 'workload' },
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage),
        title: 'Users · Q Desk',
      },
      {
        path: 'profile',
        canActivate: [accountGuard],
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
        title: 'Profile · Q Desk',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
