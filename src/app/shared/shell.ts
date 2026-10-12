import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon } from './icon';
import { AiChat } from './ai-chat';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, AiChat],
  template: `
    <div class="app-shell">
      <nav class="app-sidebar">
        <div class="sidebar-logo">
          <a routerLink="/">
            <img src="logo-custom.png" alt="Q Desk" />
          </a>
        </div>
        <div class="sidebar-nav">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="sidebar-link">
            <app-icon name="apps" />
            <span>Projects</span>
          </a>
          <a routerLink="/dashboard" routerLinkActive="active" class="sidebar-link">
            <app-icon name="chart" />
            <span>Dashboard</span>
          </a>
          <a routerLink="/q/qa" routerLinkActive="active" [routerLinkActiveOptions]="{exact: false}" class="sidebar-link">
            <app-icon name="testcase" />
            <span>TC Generator</span>
          </a>
          <a routerLink="/q/qc" routerLinkActive="active" [routerLinkActiveOptions]="{exact: false}" class="sidebar-link">
            <app-icon name="template" />
            <span>Docs Generator</span>
          </a>
        </div>
      </nav>
      <main class="app-main">
        <router-outlet />
      </main>
      <app-ai-chat />
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .app-sidebar {
      width: 180px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex: none;
    }
    .sidebar-logo {
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 var(--space-4);
      border-bottom: 1px solid var(--border);
    }
    .sidebar-logo a {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .sidebar-logo img {
      height: 36px;
      max-width: 100%;
      object-fit: contain;
      display: block;
    }
    .sidebar-nav {
      padding: var(--space-3) var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .sidebar-link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      color: var(--text-2);
      border-radius: var(--radius-md);
      font-weight: 500;
      transition: background var(--ease), color var(--ease);
      text-decoration: none !important;
    }
    .sidebar-link:hover {
      background: var(--neutral-50);
      color: var(--text);
    }
    .sidebar-link.active {
      background: var(--primary-soft);
      color: var(--primary);
      font-weight: 600;
    }
    @media (max-width: 768px) {
      .app-sidebar {
        width: 60px;
      }
      .sidebar-logo {
        padding: 0 var(--space-2);
        justify-content: center;
      }
      .sidebar-logo img {
        height: 24px;
      }
      .sidebar-nav {
        padding: var(--space-2) var(--space-1);
        align-items: center;
      }
      .sidebar-link {
        padding: var(--space-2);
        justify-content: center;
        width: 44px;
        height: 44px;
      }
      .sidebar-link span {
        display: none;
      }
    }
    .app-main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
}
