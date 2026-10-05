import { Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { TicketSearchResult } from '../core/models';
import { ChangePassword } from './change-password';
import { Icon } from './icon';
import { NotificationBell } from './notification-bell';
import { Avatar } from './avatar';

@Component({
  selector: 'app-topbar',
  imports: [Avatar, RouterLink, RouterLinkActive, ChangePassword, Icon, NotificationBell],
  template: `
    <header class="topbar">
      <!-- The mark stays as the way home; the "Q Desk" word is what's gone — the page below
           says what you are looking at, so the bar carries the picture, not the name. -->
      <a class="brand" routerLink="/" aria-label="Q Desk home" title="Q Desk">
        <img class="brand-logo" src="logo-mark.png" alt="Q Desk" />
      </a>
      <!-- A quiet way back to the project list; the page below says what you are looking at. -->
      @if (crumb()) {
        <a class="back-link" routerLink="/">
          <app-icon name="back" />
          <span>Projects</span>
        </a>
      }
      <!-- The two apps, and the way back to the launcher. Plain links: switching app is a
           navigation, not a session change, so nobody is ever signed out by using it. -->
      <nav class="app-switch" aria-label="Switch app">
        <a class="app-switch-home" routerLink="/home" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active"
          aria-label="All apps" title="All apps"><app-icon name="apps" /></a>
        <a routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active"
          aria-label="Q Desk, the ticket tracker" title="Q Desk">
          <app-icon name="folder" /><span class="app-switch-label">Q Desk</span>
        </a>
        <a routerLink="/q" [class.active]="inQGenerator()"
          aria-label="Q Generator" title="Q Generator">
          <app-icon name="testcase" /><span class="app-switch-label">Q Generator</span>
        </a>
      </nav>

      <!-- Inside Q Generator: secondary tab bar QA | QC -->
      @if (inQGenerator()) {
        <nav class="q-tabs" aria-label="Q Generator sections">
          <a routerLink="/q/qa" routerLinkActive="active" aria-label="QA Generator">QA</a>
          <a routerLink="/q/qc" routerLinkActive="active" aria-label="QC Generator">QC</a>
        </nav>
      }
      <!-- Order: search, the page's own action (Create ticket), notifications, then who you are. -->
      <div class="topbar-actions">
        @if (auth.user()) {
          <!-- Global search across every project this account can see; two characters start it. -->
          <div class="topbar-search">
            <app-icon name="search" />
            <!-- type="text", not "search": Chromium clears a search input on Escape, which would
                 eat the query the user is about to correct. -->
            <input #globalSearch type="text" inputmode="search" placeholder="Search tickets" autocomplete="off"
              aria-label="Search all projects" [value]="query()"
              (input)="onSearchInput(globalSearch.value)" (keydown.enter)="openFirst()" />
            @if (searchOpen()) {
              <div class="menu search-results" role="listbox" aria-label="Search results">
                @for (hit of results(); track hit.ticketId) {
                  <a role="option" class="search-hit" [routerLink]="['/projects', hit.projectId]"
                    [queryParams]="{ ticket: hit.ticketId }" (click)="closeSearch()">
                    <span class="id-chip">{{ hit.ticketKey }}</span>
                    <span class="hit-title">{{ hit.title }}</span>
                    <span class="hit-project muted small">{{ hit.projectName }}</span>
                  </a>
                } @empty {
                  <p class="search-empty muted small">No tickets match “{{ query() }}”.</p>
                }
              </div>
            }
          </div>
        }
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
                    <!-- One Dashboard now holds both views; the legacy paths still count as here. -->
                    <a role="menuitem" routerLink="/dashboard"
                      [class.active]="isAt('/dashboard') || isAt('/leader') || isAt('/users-dashboard')"
                      (click)="menuOpen.set(false)">
                      <app-icon name="chart" /> Dashboard
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
  private readonly api = inject(ApiService);

  readonly query = signal('');
  readonly results = signal<TicketSearchResult[]>([]);
  readonly searchOpen = signal(false);
  /** Debounce token and request counter: only the last keystroke's answer may speak. */
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;

  /** Fires 250ms after the last keystroke — the same debounce the ticket list search uses. */
  onSearchInput(value: string) {
    this.query.set(value);
    this.searchOpen.set(false);
    if (this.searchTimer) clearTimeout(this.searchTimer);

    const q = value.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    const seq = ++this.searchSeq;
    this.searchTimer = setTimeout(async () => {
      let hits: TicketSearchResult[];
      try {
        hits = await this.api.searchTickets(q);
      } catch {
        // The error interceptor has already surfaced why; show nothing rather than a stale list.
        return;
      }
      if (seq !== this.searchSeq) return; // a later keystroke has since spoken for us
      this.results.set(hits);
      this.searchOpen.set(true);
    }, 250);
  }

  closeSearch() {
    this.searchOpen.set(false);
  }

  /** Enter opens the top hit, so a pasted key never needs the mouse. */
  openFirst() {
    const first = this.results()[0];
    if (!first) return;
    this.closeSearch();
    this.router.navigate(['/projects', first.projectId], { queryParams: { ticket: first.ticketId } });
  }
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

  readonly inQGenerator = computed(() => {
    const p = this.path();
    return p === '/q' || p.startsWith('/q/') || p === '/testcases' || p.startsWith('/testcases/');
  });

  /** Whether the page on screen is this one (or below it, unless exact). */
  isAt(prefix: string, exact = false) {
    const p = this.path();
    return exact ? p === prefix : p === prefix || p.startsWith(prefix + '/');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const inMenu = this.host.nativeElement.querySelector('.user-menu')?.contains(event.target as Node);
    if (this.menuOpen() && !inMenu) this.menuOpen.set(false);
    const inSearch = this.host.nativeElement.querySelector('.topbar-search')?.contains(event.target as Node);
    if (this.searchOpen() && !inSearch) this.searchOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuOpen.set(false);
    this.searchOpen.set(false);
  }
}
