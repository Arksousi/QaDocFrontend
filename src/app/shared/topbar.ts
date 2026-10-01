import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ChangePassword } from './change-password';
import { Icon } from './icon';
import { NotificationBell } from './notification-bell';
import { Avatar } from './avatar';

@Component({
  selector: 'app-topbar',
  imports: [Avatar, RouterLink, ChangePassword, Icon, NotificationBell],
  template: `
    <header class="topbar">
      <!-- Mark plus the name as real text: the full lockup's wordmark is unreadable at bar size. -->
      <a class="brand" routerLink="/" aria-label="QaDoc home" title="QaDoc">
        <img class="brand-logo" src="logo-mark.svg" alt="" />
        <span class="brand-name">QaDoc</span>
      </a>
      <!-- Only a way back. The page below states what you are looking at, once, in full size —
           repeating it up here is what made this bar look cluttered. -->
      @if (crumb()) {
        <a class="back-link" routerLink="/">
          <app-icon name="back" />
          <span>Projects</span>
        </a>
      }
      <div class="topbar-actions">
        <ng-content />
        @if (auth.user() && !auth.isGuest()) {
          <app-notification-bell />
        }
        @if (auth.user(); as me) {
          <div class="user-menu">
            <button class="user-button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-haspopup="menu">
              <app-avatar [userId]="me.userId" [name]="me.displayName" [card]="false" />
              <span class="user-name">{{ me.displayName }}</span>
              <app-icon name="caret" />
            </button>
            @if (menuOpen()) {
              <!-- Who you are on top, then three groups: where to go, admin tools, your account.
                   Each person sees only the entries their role allows, as before. -->
              <div class="menu account-menu" role="menu">
                <div class="menu-header account-head">
                  <app-avatar size="lg" [userId]="me.userId" [name]="me.displayName" [card]="false" />
                  <div class="account-who">
                    <strong class="account-name">{{ me.displayName }}</strong>
                    @if (auth.isGuest()) {
                      <span class="muted small">Browsing sample data</span>
                    } @else {
                      <span class="account-meta">
                        <span class="muted small">{{ '@' + me.username }}</span>
                        <span class="role role-{{ me.role.toLowerCase() }}">{{ me.role }}</span>
                      </span>
                      @if (me.jobTitle) { <span class="muted small account-title">{{ me.jobTitle }}</span> }
                    }
                  </div>
                </div>

                @if (!auth.isGuest()) {
                  <a role="menuitem" routerLink="/profile" [class.active]="isAt('/profile')" (click)="menuOpen.set(false)">
                    <app-icon name="user" /> Profile
                  </a>
                }
                <div class="menu-group" role="group" aria-label="Go to">
                  <span class="menu-label" aria-hidden="true">Go to</span>
                  <a role="menuitem" routerLink="/" [class.active]="isAt('/', true) || isAt('/projects')" (click)="menuOpen.set(false)">
                    <app-icon name="folder" /> Projects
                  </a>
                  @if (auth.canLead()) {
                    <a role="menuitem" routerLink="/leader" [class.active]="isAt('/leader')" (click)="menuOpen.set(false)">
                      <app-icon name="chart" /> Leader Dashboard
                    </a>
                    <a role="menuitem" routerLink="/users-dashboard" [class.active]="isAt('/users-dashboard')" (click)="menuOpen.set(false)">
                      <app-icon name="users" /> Users Dashboard
                    </a>
                  }
                </div>
                @if (auth.isAdmin()) {
                  <div class="menu-group" role="group" aria-label="Admin">
                    <span class="menu-label" aria-hidden="true">Admin</span>
                    <a role="menuitem" routerLink="/users" [class.active]="isAt('/users', true)" (click)="menuOpen.set(false)">
                      <app-icon name="shield" /> Manage users
                    </a>
                  </div>
                }
                <div class="menu-group" role="group" aria-label="Account">
                  @if (!auth.isGuest()) {
                    <button role="menuitem" (click)="menuOpen.set(false); changingPassword.set(true)">
                      <app-icon name="lock" /> Change password
                    </button>
                  }
                  <button role="menuitem" class="menu-danger" (click)="auth.logout()">
                    <app-icon name="logout" /> {{ auth.isGuest() ? 'Leave the tour' : 'Sign out' }}
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </header>

    @if (auth.isGuest()) {
      <div class="guest-bar" role="status">
        You're exploring <strong>sample data</strong> as a guest. Nothing here can be changed.
        <button class="link-btn" (click)="auth.logout()">Sign in to your workspace</button>
      </div>
    }

    @if (changingPassword()) {
      <app-change-password (closed)="changingPassword.set(false)" />
    }
  `,
})
export class Topbar {
  protected readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Set on any page below Projects; its presence is what shows the way back. */
  readonly crumb = input<string | null>(null);
  readonly menuOpen = signal(false);
  readonly changingPassword = signal(false);

  private readonly router = inject(Router);
  /** The path of the page on screen, so the menu can mark where you are. */
  private readonly path = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url.split(/[?#]/)[0])),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /** Whether the page on screen is this one (or below it, unless exact). */
  isAt(prefix: string, exact = false) {
    const p = this.path();
    return exact ? p === prefix : p === prefix || p.startsWith(prefix + '/');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.menuOpen() && !this.host.nativeElement.querySelector('.user-menu')?.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuOpen.set(false);
  }
}
