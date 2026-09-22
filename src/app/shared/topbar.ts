import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { avatarTone, initials } from '../core/models';
import { ChangePassword } from './change-password';
import { Icon } from './icon';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, ChangePassword, Icon],
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
        @if (auth.user(); as me) {
          <div class="user-menu">
            <button class="user-button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-haspopup="menu">
              <span class="avatar avatar-t{{ toneOf(me.displayName) }}" aria-hidden="true">{{ initialsOf(me.displayName) }}</span>
              <span class="user-name">{{ me.displayName }}</span>
              <app-icon name="caret" />
            </button>
            @if (menuOpen()) {
              <div class="menu" role="menu">
                <div class="menu-header">
                  <strong>{{ me.displayName }}</strong>
                  <span class="muted small">
                    @if (auth.isGuest()) { Browsing sample data } @else { {{ '@' + me.username }} · {{ me.role }} }
                  </span>
                </div>
                <a role="menuitem" routerLink="/" (click)="menuOpen.set(false)">Projects</a>
                @if (auth.isAdmin()) {
                  <a role="menuitem" routerLink="/users" (click)="menuOpen.set(false)">Manage users</a>
                }
                @if (!auth.isGuest()) {
                  <button role="menuitem" (click)="menuOpen.set(false); changingPassword.set(true)">Change password</button>
                }
                <button role="menuitem" (click)="auth.logout()">{{ auth.isGuest() ? 'Leave the tour' : 'Sign out' }}</button>
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
  readonly initialsOf = initials;
  readonly toneOf = avatarTone;

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
