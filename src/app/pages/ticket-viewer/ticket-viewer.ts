import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Folder, Project, STATES, Suggestions, Ticket, UserOption, canEditTickets, canManageMembers, initials, slug } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { TicketCreate } from '../../shared/ticket-create';
import { TicketDetails } from '../../shared/ticket-details';
import { Modal } from '../../shared/modal';
import { Topbar } from '../../shared/topbar';

type SortKey = 'ticketId' | 'title' | 'assignedToName' | 'state' | 'tags' | 'activityDate';

@Component({
  selector: 'app-ticket-viewer',
  imports: [FormsModule, DatePipe, Topbar, TicketCreate, TicketDetails, Modal],
  template: `
    <app-topbar [crumb]="project()?.projectName ?? null">
      @if (canEdit()) {
        <button class="btn btn-primary" (click)="creating.set(true)">+ Create ticket</button>
      }
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>{{ project()?.projectName ?? 'Tickets' }}</h1>
          @if (project(); as p) {
            <p class="muted"><span class="id-chip">{{ p.projectCode }}</span> · {{ p.openTicketCount }} open of {{ p.ticketCount }} tickets</p>
          }
        </div>
      </div>

      <div class="folder-layout">
      <nav class="folder-rail card" aria-label="Folders">
        <h2 class="section-title">Folders</h2>
        <input class="folder-search" type="search" placeholder="Search folders…" aria-label="Search folders"
          [ngModel]="folderSearch()" (ngModelChange)="folderSearch.set($event)" />
        <button class="folder-item" [class.active]="folderId() === null" (click)="selectFolder(null)">
          <span class="grow">All tickets</span>
          <span class="muted small">{{ project()?.ticketCount ?? 0 }}</span>
        </button>
        @for (f of visibleFolders(); track f.folderId) {
          <div class="folder-row">
            <button class="folder-item" [class.active]="folderId() === f.folderId" (click)="selectFolder(f.folderId)">
              <span class="id-chip">{{ f.folderCode }}</span>
              <span class="grow folder-name">{{ f.folderName }}</span>
              <span class="muted small">{{ f.ticketCount }}</span>
            </button>
            @if (canManageFolders()) {
              <button class="icon-btn folder-del" (click)="removeFolder(f)" [disabled]="deletingFolder() || !!whyNotDeletable(f)"
                [title]="whyNotDeletable(f) || 'Delete folder'" [attr.aria-label]="'Delete folder ' + f.folderName">×</button>
            }
          </div>
        } @empty {
          <p class="muted small folder-empty">No folders match “{{ folderSearch() }}”.</p>
        }
        @if (canManageFolders()) {
          <button class="folder-item folder-add" (click)="openAddFolder()">+ Add folder</button>
        }
      </nav>

      <section class="card grow">
        <div class="toolbar">
          <input class="search" type="search" placeholder="Search title, assignee or key (RMS-V1-0001)…" aria-label="Search tickets"
            [ngModel]="search()" (ngModelChange)="search.set($event)" />
          <select [ngModel]="state()" (ngModelChange)="state.set($event)" aria-label="Filter by state">
            <option value="">All states</option>
            @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
          </select>
          <select [ngModel]="tag()" (ngModelChange)="tag.set($event)" aria-label="Filter by tag">
            <option value="">All tags</option>
            @for (t of suggestions().tags; track t) { <option [value]="t">{{ t }}</option> }
          </select>
          <label class="check">
            <input type="checkbox" [ngModel]="mine()" (ngModelChange)="mine.set($event)" /> Assigned to me
          </label>
          @if (search() || state() || tag() || mine()) {
            <button class="btn btn-ghost btn-sm" (click)="clearFilters()">Clear filters</button>
          }
          <span class="muted small push-left">{{ tickets().length }} ticket(s)</span>
        </div>

        @if (loading()) {
          <p class="muted pad">Loading…</p>
        } @else if (tickets().length === 0) {
          <div class="empty">
            @if (search() || state() || tag() || mine()) {
              <h2>No tickets match these filters</h2>
              <button class="btn btn-ghost" (click)="clearFilters()">Clear filters</button>
            } @else {
              <h2>No tickets yet</h2>
              <p>Create the first ticket for this project.</p>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table table-hover">
              <thead>
                <tr>
                  @for (col of columns; track col.key) {
                    <th [class]="col.cls" [attr.aria-sort]="sortKey() === col.key ? (sortAsc() ? 'ascending' : 'descending') : 'none'">
                      <button class="th-sort" (click)="sortBy(col.key)">
                        {{ col.label }}
                        <span class="sort-arrow" aria-hidden="true">{{ sortKey() === col.key ? (sortAsc() ? '▲' : '▼') : '' }}</span>
                      </button>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (t of sorted(); track t.ticketId) {
                  <tr class="clickable" [class.row-selected]="t.ticketId === ticket()" (click)="openTicket(t.ticketId)">
                    <td class="mono nowrap">
                      <a [href]="'/projects/' + projectId() + '?ticket=' + t.ticketId" (click)="$event.preventDefault()">{{ t.ticketKey }}</a>
                    </td>
                    <td class="title-cell">
                      {{ t.title }}
                      @if (t.commentCount) { <span class="muted small" [title]="t.commentCount + ' comment(s)'">💬 {{ t.commentCount }}</span> }
                    </td>
                    <td class="nowrap">
                      @if (t.assignedToName) { <span class="person"><span class="avatar avatar-sm" aria-hidden="true">{{ initialsOf(t.assignedToName) }}</span>{{ t.assignedToName }}</span> } @else { <span class="muted">Unassigned</span> }
                    </td>
                    <td><span class="state state-{{ slugOf(t.state) }}">{{ t.state }}</span></td>
                    <td>
                      <span class="tags">
                        @for (tag of t.tags; track tag) { <span class="tag">{{ tag }}</span> }
                      </span>
                    </td>
                    <td class="nowrap muted">{{ t.activityDate | date: 'MMMM d, y, h:mm a' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      </div>
    </main>

    @if (addingFolder()) {
      <app-modal heading="Add folder" (closed)="addingFolder.set(false)">
        <form id="addFolderForm" class="form" (ngSubmit)="saveFolder()">
          <label>Name *
            <input name="folderName" [(ngModel)]="newFolderName" required maxlength="150"
              autofocus placeholder="e.g. Version 1" (ngModelChange)="suggestFolderCode()" />
          </label>
          <label>Code *
            <input name="folderCode" [(ngModel)]="newFolderCode" required maxlength="10" placeholder="e.g. V1"
              (ngModelChange)="newFolderCode = $event.toUpperCase(); folderCodeTouched = true" />
            <span class="hint">Tickets here will be numbered <span class="mono">{{ folderKeyExample() }}</span></span>
          </label>
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="addingFolder.set(false)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="addFolderForm"
            [disabled]="savingFolder() || !newFolderName.trim() || !newFolderCode.trim()">Add folder</button>
        </ng-container>
      </app-modal>
    }

    @if (creating()) {
      <app-ticket-create [projectId]="projectId()" [folderId]="targetFolderId()" [suggestions]="suggestions()" [users]="users()" (closed)="creating.set(false)" (created)="onCreated($event)" />
    }
    @if (ticket(); as id) {
      <app-ticket-details [ticketId]="id" [suggestions]="suggestions()" [users]="users()" [canEdit]="canEdit()" (closed)="openTicket(null)" (changed)="refresh()" />
    }
  `,
})
export class TicketViewerPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required({ transform: numberAttribute });
  /** ?ticket=<id> opens the Ticket Details window. */
  readonly ticket = input(null, { transform: (v: unknown) => (v ? Number(v) : null) });

  readonly project = signal<Project | null>(null);
  /** Contributors and Managers may change tickets; Viewers may only read and comment. */
  readonly canEdit = computed(() => canEditTickets(this.project()?.myRole));
  readonly tickets = signal<Ticket[]>([]);
  readonly folders = signal<Folder[]>([]);
  /** null means "All tickets" across every folder. */
  readonly folderId = signal<number | null>(null);
  readonly canManageFolders = computed(() => canManageMembers(this.project()?.myRole));
  readonly folderSearch = signal('');
  /** Filters the rail by folder name or code; the selected folder stays selected either way. */
  readonly visibleFolders = computed(() => {
    const q = this.folderSearch().trim().toLowerCase();
    if (!q) return this.folders();
    return this.folders().filter((f) => f.folderName.toLowerCase().includes(q) || f.folderCode.toLowerCase().includes(q));
  });
  readonly addingFolder = signal(false);
  readonly savingFolder = signal(false);
  readonly deletingFolder = signal(false);
  newFolderName = '';
  newFolderCode = '';
  folderCodeTouched = false;

  /**
   * Where a new ticket goes: the selected folder, or the first one when viewing All. A project
   * always has at least one folder, so this only falls back to 0 before the first load.
   */
  readonly targetFolderId = computed(() => this.folderId() ?? this.folders()[0]?.folderId ?? 0);
  readonly suggestions = signal<Suggestions>({ tags: [] });
  readonly users = signal<UserOption[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  readonly search = signal('');
  readonly state = signal('');
  readonly tag = signal('');
  readonly mine = signal(false);
  readonly sortKey = signal<SortKey>('activityDate');
  readonly sortAsc = signal(false);

  readonly states = STATES;
  readonly slugOf = slug;
  readonly initialsOf = initials;
  readonly columns: { key: SortKey; label: string; cls: string }[] = [
    // Title takes whatever width is left; every other column shrinks to its content.
    { key: 'ticketId', label: 'ID', cls: 'col-fit' },
    { key: 'title', label: 'Title', cls: 'col-grow' },
    { key: 'assignedToName', label: 'Assigned To', cls: 'col-fit' },
    { key: 'state', label: 'State', cls: 'col-fit' },
    { key: 'tags', label: 'Tag', cls: 'col-tags' },
    { key: 'activityDate', label: 'Activity Date', cls: 'col-fit' },
  ];

  readonly sorted = computed(() => {
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    const value = (t: Ticket): string | number =>
      key === 'ticketId' ? t.ticketKey.toLowerCase()
      : key === 'state' ? STATES.indexOf(t.state)
      : key === 'tags' ? t.tags.join(', ').toLowerCase()
      : key === 'activityDate' ? t.activityDate
      : (t[key] ?? '').toLowerCase();
    return [...this.tickets()].sort((a, b) => (value(a) > value(b) ? dir : value(a) < value(b) ? -dir : b.ticketId - a.ticketId));
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const id = this.projectId();
      this.loadProject(id);
      this.loadFolders(id);
    });
    effect(() => {
      const [id, folderId, search, state, tag, mine] =
        [this.projectId(), this.folderId(), this.search(), this.state(), this.tag(), this.mine()];
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.loadTickets(id, folderId, search, state, tag, mine), search ? 250 : 0);
    });
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortAsc.update((v) => !v);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(key !== 'activityDate');
    }
  }

  selectFolder(id: number | null) {
    this.folderId.set(id);
  }

  openAddFolder() {
    this.newFolderName = '';
    this.newFolderCode = '';
    this.folderCodeTouched = false;
    this.addingFolder.set(true);
  }

  /** Mirrors the project-code suggestion: "Version 1" -> V1, single words truncated. */
  suggestFolderCode() {
    if (this.folderCodeTouched) return;
    const words = this.newFolderName.trim().split(/\s+/).filter(Boolean);
    const derived = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4);
    this.newFolderCode = derived.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
  }

  folderKeyExample() {
    return `${this.project()?.projectCode ?? 'RMS'}-${this.newFolderCode || 'V1'}-0001`;
  }

  /**
   * Why this folder cannot be deleted, or empty when it can. The API refuses both cases too; saying
   * so on the button is clearer than letting the click fail.
   */
  whyNotDeletable(f: Folder) {
    if (f.ticketCount > 0) return `Move or delete this folder's ${f.ticketCount} ticket(s) first`;
    if (this.folders().length <= 1) return 'A project needs at least one folder';
    return '';
  }

  async removeFolder(f: Folder) {
    if (this.whyNotDeletable(f) || this.deletingFolder()) return;
    if (!confirm(`Delete the empty folder “${f.folderName}” (${f.folderCode})?`)) return;
    this.deletingFolder.set(true);
    try {
      await this.api.deleteFolder(this.projectId(), f.folderId);
      this.toast.success(`Folder “${f.folderName}” deleted.`);
      // Viewing the folder that just went: fall back to every ticket in the project.
      if (this.folderId() === f.folderId) this.selectFolder(null);
      await this.loadFolders(this.projectId());
    } finally {
      this.deletingFolder.set(false);
    }
  }

  async saveFolder() {
    const name = this.newFolderName.trim();
    const code = this.newFolderCode.trim().toUpperCase();
    if (!name || !code || this.savingFolder()) return;
    this.savingFolder.set(true);
    try {
      const { id } = await this.api.createFolder(this.projectId(), name, code);
      this.addingFolder.set(false);
      await this.loadFolders(this.projectId());
      this.selectFolder(id);
    } finally {
      this.savingFolder.set(false);
    }
  }

  clearFilters() {
    this.search.set('');
    this.state.set('');
    this.tag.set('');
    this.mine.set(false);
  }

  openTicket(id: number | null) {
    this.router.navigate([], { queryParams: { ticket: id }, queryParamsHandling: 'merge' });
  }

  onCreated(id: number) {
    this.creating.set(false);
    this.refresh();
    this.openTicket(id);
  }

  refresh() {
    this.loadProject(this.projectId());
    this.loadFolders(this.projectId());
    this.loadTickets(this.projectId(), this.folderId(), this.search(), this.state(), this.tag(), this.mine());
  }

  private async loadFolders(id: number) {
    this.folders.set(await this.api.folders(id));
  }

  private async loadProject(id: number) {
    const [project, suggestions, users] = await Promise.all([this.api.project(id), this.api.suggestions(id), this.api.userOptions()]);
    this.project.set(project);
    this.suggestions.set(suggestions);
    this.users.set(users);
  }

  private async loadTickets(id: number, folderId: number | null, search: string, state: string, tag: string, mine: boolean) {
    try {
      const assignedTo = mine ? this.auth.user()?.userId : null;
      this.tickets.set(await this.api.tickets(id, { folderId, search, state, tag, assignedTo }));
    } finally {
      this.loading.set(false);
    }
  }
}
