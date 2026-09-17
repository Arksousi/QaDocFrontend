import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Project, canManageMembers } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Topbar } from '../../shared/topbar';
import { ProjectMembers } from './project-members';

@Component({
  selector: 'app-project-menu',
  imports: [FormsModule, RouterLink, DatePipe, Modal, Topbar, ProjectMembers],
  template: `
    <app-topbar>
      <button class="btn btn-primary" (click)="openAdd()">+ Add project</button>
    </app-topbar>

    <main class="page">
      <h1>Projects</h1>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (projects().length === 0) {
        <div class="card empty">
          <h2>No projects yet</h2>
          <p>Add a project to start tracking tickets.</p>
        </div>
      } @else {
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" class="section-title">Recent projects</h2>
          <div class="recent-grid">
            @for (p of recent(); track p.projectId) {
              <div class="recent-item">
                <a class="card recent-card" [routerLink]="['/projects', p.projectId]">
                  <span class="id-chip">{{ p.projectCode }}</span>
                  <h3>{{ p.projectName }}</h3>
                  <p class="muted small">{{ p.openTicketCount }} open · {{ p.ticketCount }} total</p>
                  <p class="muted small">Last activity {{ p.lastActivity | date: 'MMM d, y, h:mm a' }}</p>
                  @if (p.createdByName) { <p class="muted small">Created by {{ p.createdByName }}</p> }
                </a>
                <div class="row-menu">
                  <button class="icon-btn" (click)="toggleMenu('card', p)"
                    [attr.aria-expanded]="menuKey() === 'card:' + p.projectId" aria-haspopup="menu"
                    [attr.aria-label]="'Actions for ' + p.projectName">⋯</button>
                  @if (menuKey() === 'card:' + p.projectId) {
                    <div class="menu" role="menu">
                      <button role="menuitem" (click)="openInfo(p)">Project info</button>
                      @if (canManage(p)) {
                        <button role="menuitem" (click)="openMembers(p)">Manage members…</button>
                      }
                      @if (auth.isAdmin()) {
                        <button role="menuitem" class="danger" (click)="askDelete(p)">Delete project…</button>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </section>

        <section class="card" aria-labelledby="all-heading">
          <div class="card-head">
            <h2 id="all-heading" class="section-title">All projects</h2>
            <input class="search" type="search" placeholder="Search by name…" aria-label="Search projects"
              [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </div>
          <div class="table-wrap" [class.menu-open]="menuKey() !== null">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Created by</th><th class="num">Open tickets</th><th class="num">Total tickets</th>
                  <th>Last activity</th><th class="w-actions"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (p of filtered(); track p.projectId) {
                  <tr class="clickable" (click)="open(p)">
                    <td><span class="id-chip">{{ p.projectCode }}</span></td>
                    <td><a [routerLink]="['/projects', p.projectId]" (click)="$event.stopPropagation()">{{ p.projectName }}</a></td>
                    <td>
                      @if (p.createdByName) { {{ p.createdByName }} } @else { <span class="muted">—</span> }
                    </td>
                    <td class="num">{{ p.openTicketCount }}</td>
                    <td class="num">{{ p.ticketCount }}</td>
                    <td class="muted nowrap">{{ p.lastActivity | date: 'MMM d, y, h:mm a' }}</td>
                    <td class="w-actions" (click)="$event.stopPropagation()">
                      <div class="row-menu">
                        <button class="icon-btn" (click)="toggleMenu('row', p)"
                          [attr.aria-expanded]="menuKey() === 'row:' + p.projectId" aria-haspopup="menu"
                          [attr.aria-label]="'Actions for ' + p.projectName">⋯</button>
                        @if (menuKey() === 'row:' + p.projectId) {
                          <div class="menu" role="menu">
                            <button role="menuitem" (click)="openInfo(p)">Project info</button>
                            @if (canManage(p)) {
                              <button role="menuitem" (click)="openMembers(p)">Manage members…</button>
                            }
                            @if (auth.isAdmin()) {
                              <button role="menuitem" class="danger" (click)="askDelete(p)">Delete project…</button>
                            }
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="muted center">No projects match “{{ search() }}”.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </main>

    @if (adding()) {
      <app-modal heading="Add project" (closed)="adding.set(false)">
        <form id="addProjectForm" class="form" (ngSubmit)="save()">
          <label>Name *
            <input name="name" [(ngModel)]="newName" required maxlength="150" autofocus
              placeholder="e.g. Restaurant Management System" (ngModelChange)="suggestCode()" />
          </label>
          <label>Code *
            <input name="code" [(ngModel)]="newCode" required maxlength="10" placeholder="e.g. RMS"
              (ngModelChange)="newCode = $event.toUpperCase(); codeTouched = true" />
            <span class="hint">Starts every ticket key in this project, e.g. <span class="mono">{{ keyExample() }}</span></span>
          </label>
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="adding.set(false)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="addProjectForm" [disabled]="saving() || !newName.trim() || !newCode.trim()">Add project</button>
        </ng-container>
      </app-modal>
    }

    @if (info(); as p) {
      <app-modal heading="Project info" (closed)="info.set(null)">
        <h3>{{ p.projectName }}</h3>
        <dl class="info-list">
          <dt>Code</dt>
          <dd><span class="id-chip">{{ p.projectCode }}</span></dd>
          <dt>Created by</dt>
          <dd>{{ p.createdByName ?? 'unknown' }}</dd>
          <dt>Created</dt>
          <dd>{{ p.createdAt | date: 'MMM d, y, h:mm a' }}</dd>
          <dt>Open tickets</dt>
          <dd>{{ p.openTicketCount }}</dd>
          <dt>Total tickets</dt>
          <dd>{{ p.ticketCount }}</dd>
          <dt>Last activity</dt>
          <dd>{{ p.lastActivity | date: 'MMM d, y, h:mm a' }}</dd>
        </dl>
        <ng-container modal-actions>
          @if (auth.isAdmin()) {
            <button class="btn btn-ghost danger" (click)="askDelete(p)">Delete project…</button>
            <span class="grow"></span>
          }
          <button class="btn btn-ghost" (click)="info.set(null)">Close</button>
          <a class="btn btn-primary" [routerLink]="['/projects', p.projectId]">Open project</a>
        </ng-container>
      </app-modal>
    }

    @if (managing(); as p) {
      <app-project-members [project]="p" (closed)="managing.set(null)" (changed)="load()" />
    }

    @if (confirming(); as p) {
      <app-modal heading="Delete project" (closed)="cancelDelete()">
        <p>
          @if (p.ticketCount > 0) {
            This permanently deletes <strong>{{ p.projectName }}</strong> and all
            {{ p.ticketCount }} {{ p.ticketCount === 1 ? 'ticket' : 'tickets' }} in it, with their comments and history.
          } @else {
            This permanently deletes <strong>{{ p.projectName }}</strong>. It has no tickets.
          }
        </p>
        <form id="deleteProjectForm" class="form" (ngSubmit)="remove()">
          <label>
            <span>Type “<span class="danger mono">{{ p.projectName }}</span>” to confirm</span>
            <input name="confirmName" [(ngModel)]="confirmName" autocomplete="off" autofocus
              [attr.aria-label]="'Type ' + p.projectName + ' to confirm deletion'" />
          </label>
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
          <button class="btn btn-danger" type="submit" form="deleteProjectForm" [disabled]="!nameMatches() || deleting()">
            {{ deleting() ? 'Deleting…' : 'Delete project' }}
          </button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class ProjectMenuPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly auth = inject(AuthService);

  readonly projects = signal<Project[]>([]);
  readonly recent = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');
  newName = '';
  newCode = '';
  /** Stops the suggestion overwriting a code the user typed themselves. */
  codeTouched = false;

  /** Which ⋯ menu is open, as "<surface>:<projectId>" — a project appears in both the cards and the table. */
  readonly menuKey = signal<string | null>(null);
  readonly info = signal<Project | null>(null);
  readonly managing = signal<Project | null>(null);
  readonly confirming = signal<Project | null>(null);
  readonly deleting = signal(false);
  confirmName = '';

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.projects();
    return this.projects().filter((p) => p.projectName.toLowerCase().includes(q));
  });

  async ngOnInit() {
    await this.load();
  }

  /** Also called after membership changes: a role change can alter what the menu offers. */
  async load() {
    try {
      const [all, recent] = await Promise.all([this.api.projects(), this.api.recentProjects(5)]);
      this.projects.set(all);
      this.recent.set(recent);
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.newName = '';
    this.newCode = '';
    this.codeTouched = false;
    this.adding.set(true);
  }

  /**
   * Offers a code as the name is typed: initials for multi-word names ("Restaurant Management
   * System" → RMS), the first letters otherwise. Mirrors what the migration does to old projects.
   */
  suggestCode() {
    if (this.codeTouched) return;
    const words = this.newName.trim().split(/\s+/).filter(Boolean);
    const derived =
      words.length > 1
        ? words.map((w) => w[0]).join('')
        : (words[0] ?? '').slice(0, 4);
    this.newCode = derived.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
  }

  keyExample() {
    return `${this.newCode || 'RMS'}-V1-0001`;
  }

  async save() {
    const name = this.newName.trim();
    const code = this.newCode.trim().toUpperCase();
    if (!name || !code || this.saving()) return;
    this.saving.set(true);
    try {
      const { id } = await this.api.createProject(name, code);
      this.toast.success(`Project “${name}” (${code}) created.`);
      this.router.navigate(['/projects', id]);
    } finally {
      this.saving.set(false);
    }
  }

  open(p: Project) {
    this.router.navigate(['/projects', p.projectId]);
  }

  // ---------- ⋯ menu ----------

  toggleMenu(surface: 'card' | 'row', p: Project) {
    const key = `${surface}:${p.projectId}`;
    this.menuKey.set(this.menuKey() === key ? null : key);
  }

  openInfo(p: Project) {
    this.menuKey.set(null);
    this.info.set(p);
  }

  /** Managers on their own project; Admins are reported as Manager everywhere. */
  canManage(p: Project) {
    return canManageMembers(p.myRole);
  }

  openMembers(p: Project) {
    this.menuKey.set(null);
    this.info.set(null);
    this.managing.set(p);
  }

  /** Opens the type-to-confirm dialog. Closes the info modal so the two never stack. */
  askDelete(p: Project) {
    this.menuKey.set(null);
    this.info.set(null);
    this.confirmName = '';
    this.confirming.set(p);
  }

  cancelDelete() {
    this.confirming.set(null);
    this.confirmName = '';
  }

  /** The typed name must match exactly (trimmed) before Delete becomes clickable. */
  nameMatches() {
    const p = this.confirming();
    return !!p && this.confirmName.trim() === p.projectName;
  }

  async remove() {
    const p = this.confirming();
    if (!p || !this.nameMatches() || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.api.deleteProject(p.projectId);
      this.toast.success(`Project “${p.projectName}” deleted.`);
      this.cancelDelete();
      await this.load();
    } finally {
      this.deleting.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.menuKey() && !(event.target as HTMLElement).closest?.('.row-menu')) this.menuKey.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuKey.set(null);
  }
}
