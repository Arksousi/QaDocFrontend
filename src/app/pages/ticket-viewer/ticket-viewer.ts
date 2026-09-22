import { DatePipe } from '@angular/common';
import { Component, HostListener, WritableSignal, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Folder, Project, STATES, Suggestions, TICKET_TYPES, Ticket, UserOption, avatarTone, canEditTickets, canManageMembers, initials, slug } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { TicketCreate } from '../../shared/ticket-create';
import { TicketDetails } from '../../shared/ticket-details';
import { Modal } from '../../shared/modal';
import { TypeIcon } from '../../shared/type-icon';
import { Topbar } from '../../shared/topbar';
import { Icon } from '../../shared/icon';

type SortKey = 'ticketType' | 'ticketId' | 'title' | 'assignedToName' | 'state' | 'tags' | 'activityDate';
type FilterMenu = 'state' | 'type' | 'tag';

/** "All tags" when nothing is ticked, the value itself when one is, a count beyond that. */
const summarise = (picked: string[], plural: string) =>
  picked.length === 0 ? `All ${plural}` : picked.length === 1 ? picked[0] : `${picked.length} ${plural}`;

@Component({
  selector: 'app-ticket-viewer',
  imports: [FormsModule, DatePipe, Topbar, TicketCreate, TicketDetails, Modal, TypeIcon, Icon],
  template: `
    <app-topbar [crumb]="project()?.projectName ?? null">
      @if (canEdit()) {
        <button class="btn btn-primary" (click)="creating.set(true)"><app-icon name="plus" /> Create ticket</button>
      }
    </app-topbar>

    <main class="page">
      @if (project(); as p) {
        <header class="project-head">
          <span class="project-code">{{ p.projectCode }}</span>
          <div class="project-titles">
            <h1>{{ p.projectName }}</h1>
            <p class="project-note">
              <strong>{{ p.openTicketCount }}</strong> open
              <span class="project-note-sep" aria-hidden="true">·</span>
              {{ p.ticketCount }} total
            </p>
          </div>
        </header>
      }

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
                [title]="whyNotDeletable(f) || 'Delete folder'" [attr.aria-label]="'Delete folder ' + f.folderName"><app-icon name="close" /></button>
            }
          </div>
        } @empty {
          <p class="muted small folder-empty">No folders match “{{ folderSearch() }}”.</p>
        }
        @if (canManageFolders()) {
          <button class="folder-item folder-add" (click)="openAddFolder()"><app-icon name="plus" /> Add folder</button>
        }
      </nav>

      <section class="card grow">
        <div class="toolbar">
          <span class="search-wrap">
            <app-icon name="search" />
            <input type="search" placeholder="Search title, assignee or key (RMS-V1-0001)…" aria-label="Search tickets"
              [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </span>
          <!-- All three filters tick several values at once, so "everything still open", "bugs and
               issues" or "any of these three tags" is one look rather than several. Nothing ticked
               means no filter on that field, the same as the old "All states"/"All types" option. -->
          <div class="filter-menu">
            <button type="button" class="filter-button" (click)="toggleMenu('state')"
              [class.active]="state().length > 0" [attr.aria-expanded]="openMenu() === 'state'" aria-haspopup="true">
              <span>{{ stateLabel() }}</span>
              <span class="filter-caret"><app-icon name="caret" /></span>
            </button>
            @if (openMenu() === 'state') {
              <div class="filter-panel" role="group" aria-label="Filter by state">
                @for (s of states; track s) {
                  <label class="filter-option">
                    <input type="checkbox" [checked]="state().includes(s)" (change)="toggleState(s)" />
                    <span class="filter-marker">
                      <span class="filter-swatch state-{{ slugOf(s) }}"></span>
                    </span>
                    <span class="filter-label">{{ s }}</span>
                  </label>
                }
                @if (state().length > 0) {
                  <button type="button" class="filter-clear" (click)="state.set([])">Clear</button>
                }
              </div>
            }
          </div>
          <div class="filter-menu">
            <button type="button" class="filter-button" (click)="toggleMenu('type')"
              [class.active]="type().length > 0" [attr.aria-expanded]="openMenu() === 'type'" aria-haspopup="true">
              <span>{{ typeLabel() }}</span>
              <span class="filter-caret"><app-icon name="caret" /></span>
            </button>
            @if (openMenu() === 'type') {
              <div class="filter-panel" role="group" aria-label="Filter by type">
                @for (t of ticketTypes; track t) {
                  <label class="filter-option">
                    <input type="checkbox" [checked]="type().includes(t)" (change)="toggleType(t)" />
                    <span class="filter-marker type-chip type-{{ slugOf(t) }}">
                      <app-type-icon [type]="t" />
                    </span>
                    <span class="filter-label">{{ t }}</span>
                  </label>
                }
                @if (type().length > 0) {
                  <button type="button" class="filter-clear" (click)="type.set([])">Clear</button>
                }
              </div>
            }
          </div>
          <div class="filter-menu">
            <button type="button" class="filter-button" (click)="toggleMenu('tag')"
              [class.active]="tag().length > 0" [attr.aria-expanded]="openMenu() === 'tag'" aria-haspopup="true">
              <span>{{ tagLabel() }}</span>
              <span class="filter-caret"><app-icon name="caret" /></span>
            </button>
            @if (openMenu() === 'tag') {
              <div class="filter-panel filter-panel-scroll" role="group" aria-label="Filter by tag">
                @for (t of suggestions().tags; track t) {
                  <!-- The panel is the width of the button, so a long tag ellipsizes; the title
                       attribute is how you still read the whole thing. -->
                  <label class="filter-option" [title]="t">
                    <input type="checkbox" [checked]="tag().includes(t)" (change)="toggleTag(t)" />
                    <span class="filter-marker"><app-icon name="tag" /></span>
                    <span class="filter-label">{{ t }}</span>
                  </label>
                } @empty {
                  <p class="muted small filter-empty">No tags used in this project yet.</p>
                }
                @if (tag().length > 0) {
                  <button type="button" class="filter-clear" (click)="tag.set([])">Clear</button>
                }
              </div>
            }
          </div>
          <label class="check">
            <input type="checkbox" [ngModel]="mine()" (ngModelChange)="mine.set($event)" /> Assigned to me
          </label>
          @if (hasFilters()) {
            <button class="btn btn-ghost btn-sm" (click)="clearFilters()">Clear filters</button>
          }
          <span class="muted small push-left">{{ tickets().length }} ticket(s)</span>
        </div>

        @if (loading()) {
          <!-- One skeleton row per ticket row, in the same columns, so the table does not resize
               under the pointer the instant the results arrive. -->
          <div class="table-wrap" aria-hidden="true">
            <table class="table">
              <tbody>
                @for (i of placeholders; track i) {
                  <tr class="skeleton-row">
                    <td class="col-type"><div class="skeleton skeleton-avatar"></div></td>
                    <td class="col-id"><div class="skeleton skeleton-chip"></div></td>
                    <td class="title-cell"><div class="skeleton skeleton-line w-60"></div></td>
                    <td class="col-assignee"><div class="skeleton skeleton-avatar"></div></td>
                    <td><div class="skeleton skeleton-chip"></div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="sr-only" role="status">Loading tickets…</p>
        } @else if (tickets().length === 0) {
          <div class="empty">
            @if (hasFilters()) {
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
                        <span class="sort-arrow">
                          @if (sortKey() === col.key) { <app-icon [name]="sortAsc() ? 'sort-asc' : 'sort-desc'" /> }
                        </span>
                      </button>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (t of sorted(); track t.ticketId) {
                  <tr class="clickable" [class.row-selected]="t.ticketId === ticket()" (click)="openTicket(t.ticketId)">
                    <td class="col-type">
                      <!-- The glyph alone. Its aria-label and tooltip still name the type, so the
                           column stays readable by hover and by screen reader. -->
                      <span class="type-chip type-{{ slugOf(t.ticketType) }}" [title]="t.ticketType">
                        <app-type-icon [type]="t.ticketType" />
                      </span>
                    </td>
                    <td class="mono col-id">
                      <a [href]="'/projects/' + projectId() + '?ticket=' + t.ticketId" (click)="$event.preventDefault()">{{ t.ticketKey }}</a>
                    </td>
                    <td class="title-cell">
                      {{ t.title }}
                      @if (t.commentCount) { <span class="muted small comment-count" [title]="t.commentCount + ' comment(s)'">
                          <app-icon name="comment" class="icon-inline" />{{ t.commentCount }}
                        </span> }
                    </td>
                    <td class="col-assignee">
                      @if (t.assignedToName) {
                        <span class="person" [title]="t.assignedToName">
                          <span class="avatar avatar-sm avatar-t{{ toneOf(t.assignedToName) }}" aria-hidden="true">{{ initialsOf(t.assignedToName) }}</span>
                          <span class="person-name">{{ t.assignedToName }}</span>
                        </span>
                      } @else { <span class="muted">Unassigned</span> }
                    </td>
                    <td><span class="state state-{{ slugOf(t.state) }}">{{ t.state }}</span></td>
                    <td>
                      <span class="tags">
                        @for (tag of t.tags; track tag) { <span class="tag">{{ tag }}</span> }
                      </span>
                    </td>
                    <td class="nowrap muted">{{ t.activityDate | date: 'd MMM, h:mm a' }}</td>
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
  /** Ticked values. Empty means no filter at all on that field. */
  readonly state = signal<string[]>([]);
  readonly type = signal<string[]>([]);
  readonly tag = signal<string[]>([]);
  readonly mine = signal(false);
  /** At most one panel is open at a time, so picking a filter never buries the one beside it. */
  readonly openMenu = signal<FilterMenu | null>(null);
  readonly stateLabel = computed(() => summarise(this.state(), 'states'));
  readonly typeLabel = computed(() => summarise(this.type(), 'types'));
  readonly tagLabel = computed(() => summarise(this.tag(), 'tags'));
  readonly hasFilters = computed(() =>
    !!this.search() || this.state().length > 0 || this.type().length > 0 || this.tag().length > 0 || this.mine());
  readonly sortKey = signal<SortKey>('activityDate');
  readonly sortAsc = signal(false);

  readonly states = STATES;
  readonly ticketTypes = TICKET_TYPES;
  readonly slugOf = slug;
  readonly initialsOf = initials;
  readonly toneOf = avatarTone;
  /** Rows the skeleton draws while the first page of tickets is in flight. */
  readonly placeholders = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly columns: { key: SortKey; label: string; cls: string }[] = [
    // Title takes whatever width is left; every other column shrinks to its content.
    { key: 'ticketType', label: 'Type', cls: 'col-type' },
    { key: 'ticketId', label: 'ID', cls: 'col-id' },
    { key: 'title', label: 'Title', cls: 'col-grow' },
    { key: 'assignedToName', label: 'Assigned To', cls: 'col-assignee' },
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
      const [id, folderId, search, states, types, tags, mine] =
        [this.projectId(), this.folderId(), this.search(), this.state(), this.type(), this.tag(), this.mine()];
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.loadTickets(id, folderId, search, states, types, tags, mine), search ? 250 : 0);
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

  toggleMenu(menu: FilterMenu) {
    this.openMenu.update((open) => (open === menu ? null : menu));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // A click on any filter button is handled by that button; anything else outside closes up.
    const target = event.target;
    const insideAMenu = target instanceof Element && target.closest('.filter-menu') !== null;
    if (this.openMenu() && !insideAMenu) this.openMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.openMenu.set(null);
  }

  /** Kept in STATES order however they were ticked, so the label reads in workflow order. */
  toggleState(state: string) {
    this.tick(this.state, STATES, state);
  }

  toggleType(type: string) {
    this.tick(this.type, TICKET_TYPES, type);
  }

  toggleTag(tag: string) {
    this.tick(this.tag, this.suggestions().tags, tag);
  }

  clearFilters() {
    this.search.set('');
    this.state.set([]);
    this.type.set([]);
    this.tag.set([]);
    this.mine.set(false);
    this.openMenu.set(null);
  }

  /** Ticked values are held in the panel's own order, so the button label reads the way the list does. */
  private tick(picked: WritableSignal<string[]>, all: readonly string[], value: string) {
    picked.update((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : all.filter((v) => v === value || current.includes(v)));
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
    this.loadTickets(this.projectId(), this.folderId(), this.search(), this.state(), this.type(), this.tag(), this.mine());
  }

  private async loadFolders(id: number) {
    this.folders.set(await this.api.folders(id));
  }

  private async loadProject(id: number) {
    const [project, suggestions, users] = await Promise.all([this.api.project(id), this.api.suggestions(id), this.api.projectAssignees(id)]);
    this.project.set(project);
    this.suggestions.set(suggestions);
    this.users.set(users);
  }

  private async loadTickets(id: number, folderId: number | null, search: string, states: string[], types: string[], tags: string[], mine: boolean) {
    try {
      const assignedTo = mine ? this.auth.user()?.userId : null;
      this.tickets.set(await this.api.tickets(id, { folderId, search, states, types, tags, assignedTo }));
    } finally {
      this.loading.set(false);
    }
  }
}
