import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { initials } from '../core/models';
import { ChangePassword } from './change-password';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, ChangePassword],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/" aria-label="QaDoc home" title="QaDoc"><img class="brand-logo" src="logo.svg" alt="" /></a>
      @if (crumb()) {
        <nav class="crumbs" aria-label="Breadcrumb">
          <a routerLink="/">Projects</a>
          <span aria-hidden="true">/</span>
          <span class="crumb-current">{{ crumb() }}</span>
        </nav>
      }
      <div class="topbar-actions">
        <ng-content />
        @if (auth.user(); as me) {
          <div class="user-menu">
            <button class="user-button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-haspopup="menu">
              <span class="avatar" aria-hidden="true">{{ initialsOf(me.displayName) }}</span>
              <span class="user-name">{{ me.displayName }}</span>
              <span aria-hidden="true">▾</span>
            </button>
            @if (menuOpen()) {
              <div class="menu" role="menu">
                <div class="menu-header">
                  <strong>{{ me.displayName }}</strong>
                  <span class="muted small">{{ '@' + me.username }} · {{ me.role }}</span>
                </div>
                <a role="menuitem" routerLink="/" (click)="menuOpen.set(false)">Projects</a>
                @if (auth.isAdmin()) {
                  <a role="menuitem" routerLink="/users" (click)="menuOpen.set(false)">Manage users</a>
                }
                <button role="menuitem" (click)="menuOpen.set(false); changingPassword.set(true)">Change password</button>
                <button role="menuitem" (click)="auth.logout()">Sign out</button>
              </div>
            }
          </div>
        }
      </div>
    </header>

    @if (changingPassword()) {
      <app-change-password (closed)="changingPassword.set(false)" />
    }
  `,
})
export class Topbar {
  protected readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Current page name shown after "Projects /". */
  readonly crumb = input<string | null>(null);
  readonly menuOpen = signal(false);
  readonly changingPassword = signal(false);
  readonly initialsOf = initials;

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
