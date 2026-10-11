import { DatePipe } from '@angular/common';
import { Component, HostListener, WritableSignal, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Folder, PRIORITY_LABELS, Project, STATES, Suggestions, TICKET_TYPES, Ticket, TicketState, UserOption, avatarTone, canEditTickets, canManageMembers, initials, slug, toSaveTicket } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { TicketCreate } from '../../shared/ticket-create';
import { TicketDetails } from '../../shared/ticket-details';
import { Modal } from '../../shared/modal';
import { TypeIcon } from '../../shared/type-icon';
import { Topbar } from '../../shared/topbar';
import { Icon } from '../../shared/icon';
import { Avatar } from '../../shared/avatar';

type SortKey = 'ticketType' | 'ticketId' | 'title' | 'priority' | 'assignees' | 'state' | 'tags' | 'activityDate';
type FilterMenu = 'state' | 'type' | 'tag';

/** "All tags" when nothing is ticked, the value itself when one is, a count beyond that. */
const summarise = (picked: string[], plural: string) =>
  picked.length === 0 ? `All ${plural}` : picked.length === 1 ? picked[0] : `${picked.length} ${plural}`;

interface CalCell {
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]}`;
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-ticket-viewer',
  imports: [Avatar, FormsModule, DatePipe, Topbar, TicketCreate, TicketDetails, Modal, TypeIcon, Icon],
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
              @if (p.ticketCount) {
                <span class="project-note-sep" aria-hidden="true">·</span>
                <span class="project-progress" role="img" [attr.aria-label]="donePct() + '% of tickets closed'">
                  <span class="score-bar"><span [style.width.%]="donePct()"></span></span>
                  {{ donePct() }}% done
                </span>
              }
            </p>
          </div>
        </header>
      }

      <div class="folder-layout">
      <nav class="folder-rail card" aria-label="Folders">
        <h2 class="section-title">Folders</h2>
        <input class="folder-search" type="search" placeholder="Search folders…" aria-label="Search folders"
          [ngModel]="folderSearch()" (ngModelChange)="folderSearch.set($event)" />
        <!-- Each count is "open / total", so a folder with work left stands out from a finished one. -->
        <button class="folder-item" [class.active]="folderId() === null" (click)="selectFolder(null)">
          <span class="grow">All tickets</span>
          <span class="folder-count" [title]="(project()?.openTicketCount ?? 0) + ' open of ' + (project()?.ticketCount ?? 0)">
            <b>{{ project()?.openTicketCount ?? 0 }}</b>/{{ project()?.ticketCount ?? 0 }}
          </span>
        </button>
        @for (f of visibleFolders(); track f.folderId) {
          <div class="folder-row">
            <button class="folder-item" [class.active]="folderId() === f.folderId" [class.folder-done]="f.openTicketCount === 0"
              (click)="selectFolder(f.folderId)">
              <span class="id-chip">{{ f.folderCode }}</span>
              <span class="grow folder-name">{{ f.folderName }}</span>
              <span class="folder-count" [title]="f.openTicketCount + ' open of ' + f.ticketCount"><b>{{ f.openTicketCount }}</b>/{{ f.ticketCount }}</span>
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
        <!-- How the tickets in view split by state; a chip is also a one-click filter to that state.
             The counts ignore the state filter itself, so every chip keeps its number while one is on. -->
        <div class="state-strip" role="group" aria-label="Tickets by state">
          @for (s of states; track s) {
            <button type="button" class="state-chip" [class.active]="onlyState() === s" [attr.aria-pressed]="onlyState() === s"
              (click)="focusState(s)">
              <span class="filter-swatch state-{{ slugOf(s) }}" aria-hidden="true"></span>
              <span>{{ s }}</span>
              <span class="state-chip-count">{{ stateCounts()[s] }}</span>
            </button>
          }

          <div class="date-filter-wrap">
            <button type="button" class="state-chip date-chip" [class.active]="hasDateFilter()"
              [attr.aria-pressed]="hasDateFilter()" [attr.aria-expanded]="showDateMenu()"
              (click)="toggleDateMenu($event)" title="Filter tickets by specific dates">
              <app-icon name="calendar" />
              <span>{{ dateFilterLabel() }}</span>
              @if (hasDateFilter()) {
                <span class="state-chip-count">{{ tickets().length }}</span>
                <span class="date-chip-clear" (click)="clearDateFilter($event)" title="Clear date filter" aria-label="Clear date filter">
                  <app-icon name="close" />
                </span>
              } @else {
                <span class="date-chip-caret"><app-icon name="caret" /></span>
              }
            </button>

            @if (showDateMenu()) {
              <div class="date-popover" role="dialog" aria-label="Choose specific dates" (click)="$event.stopPropagation()">
                <div class="date-popover-head">
                  <span class="date-popover-title">Specific dates</span>
                  <button type="button" class="icon-btn date-popover-close" (click)="showDateMenu.set(false)" aria-label="Close date picker">
                    <app-icon name="close" />
                  </button>
                </div>

                <div class="date-presets" role="group" aria-label="Date presets">
                  <button type="button" class="preset-btn" (click)="applyPreset('today')">Today</button>
                  <button type="button" class="preset-btn" (click)="applyPreset('yesterday')">Yesterday</button>
                  <button type="button" class="preset-btn" (click)="applyPreset('last7')">Last 7 days</button>
                  <button type="button" class="preset-btn" (click)="applyPreset('last30')">Last 30 days</button>
                  <button type="button" class="preset-btn" (click)="applyPreset('thisMonth')">This month</button>
                </div>

                <div class="date-inputs-row">
                  <label class="date-field">
                    <span class="date-field-label">From</span>
                    <input type="date" [ngModel]="draftDateFrom()" (ngModelChange)="setDraftFrom($event)" class="date-field-input" />
                  </label>
                  <span class="date-sep-arrow" aria-hidden="true">→</span>
                  <label class="date-field">
                    <span class="date-field-label">To</span>
                    <input type="date" [ngModel]="draftDateTo()" (ngModelChange)="setDraftTo($event)" class="date-field-input" />
                  </label>
                </div>

                <div class="cal-card">
                  <div class="cal-nav">
                    <button type="button" class="icon-btn cal-nav-btn" (click)="onCalPrevMonth()" aria-label="Previous month">
                      <app-icon name="back" />
                    </button>
                    <span class="cal-nav-title">{{ calMonthTitle() }}</span>
                    <button type="button" class="icon-btn cal-nav-btn" (click)="onCalNextMonth()" aria-label="Next month">
                      <app-icon name="arrow-right" />
                    </button>
                  </div>

                  <div class="cal-grid">
                    <div class="cal-weekday">Su</div>
                    <div class="cal-weekday">Mo</div>
                    <div class="cal-weekday">Tu</div>
                    <div class="cal-weekday">We</div>
                    <div class="cal-weekday">Th</div>
                    <div class="cal-weekday">Fr</div>
                    <div class="cal-weekday">Sa</div>

                    @for (cell of calDays(); track cell.dateStr) {
                      <button type="button" class="cal-cell"
                        [class.is-other-month]="!cell.isCurrentMonth"
                        [class.is-today]="cell.isToday"
                        [class.is-start]="cell.isStart"
                        [class.is-end]="cell.isEnd"
                        [class.in-range]="cell.inRange"
                        (click)="onCalDayClick(cell.dateStr)">
                        {{ cell.day }}
                      </button>
                    }
                  </div>
                </div>

                <div class="date-popover-actions">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="clearDateFilter($event)">Clear</button>
                  <span class="grow"></span>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="showDateMenu.set(false)">Cancel</button>
                  <button type="button" class="btn btn-primary btn-sm" (click)="applyDateFilter()">Apply</button>
                </div>
              </div>
            }
          </div>
        </div>
        <div class="toolbar">
          <span class="search-wrap">
            <app-icon name="search" />
            <input type="search" [placeholder]="searchHint()" aria-label="Search tickets" title="Search by title, assignee or ticket key"
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
          <!-- No "Show all tickets" beside the checkbox: the empty screen below already offers it,
               and a button that undoes the ticked box right next to the box is noise. Other filters
               still get their "Clear filters" here. -->
          @if (hasFilters() && !onlyMine()) {
            <button class="btn btn-ghost btn-sm" (click)="clearFilters()">Clear filters</button>
          }
          <span class="muted small push-left">{{ tickets().length }} {{ tickets().length === 1 ? 'ticket' : 'tickets' }}</span>
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
                    <td class="col-priority"><div class="skeleton skeleton-avatar"></div></td>
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
            @if (onlyMine()) {
              <h2>Nothing assigned to you here</h2>
              <p>Tickets assigned to you in this project show up here.</p>
              <button class="btn btn-ghost" (click)="clearFilters()">Show all tickets</button>
            } @else if (hasFilters()) {
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
                    <td class="col-priority">
                      @if (t.priority != null) {
                        <span class="prio prio-{{ t.priority }}" [title]="'Priority ' + t.priority + ' · ' + priorityLabel(t.priority)">
                          <app-icon [name]="$any('priority-' + t.priority)" />{{ t.priority }}
                        </span>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td class="col-assignee">
                      @if (t.assignees[0]; as first) {
                        <span class="person" [title]="assigneeNames(t)">
                          <app-avatar size="sm" [userId]="first.userId" [name]="first.displayName" />
                          <span class="person-name">{{ first.displayName }}</span>
                        </span>
                      } @else { <span class="muted">Unassigned</span> }
                    </td>
                    <td>
                      @if (canEdit()) {
                        <!-- Changing state is the most common edit, so it can be done from the list. -->
                        <button type="button" class="state state-{{ slugOf(t.state) }} state-button" aria-haspopup="menu"
                          [attr.aria-expanded]="stateMenu()?.ticket?.ticketId === t.ticketId"
                          [attr.aria-label]="t.ticketKey + ' state: ' + t.state + '. Change state'"
                          [disabled]="movingId() === t.ticketId" (click)="openStateMenu($event, t)">
                          {{ t.state }}<app-icon name="caret" />
                        </button>
                      } @else {
                        <span class="state state-{{ slugOf(t.state) }}">{{ t.state }}</span>
                      }
                    </td>
                    <td>
                      <span class="tags">
                        @for (tag of t.tags; track tag) { <span class="tag">{{ tag }}</span> }
                      </span>
                    </td>
                    <td class="nowrap muted col-date">{{ t.activityDate | date: 'd MMM, h:mm a' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      </div>
    </main>

    @if (stateMenu(); as m) {
      <!-- Fixed to the viewport from the pill's position, so the table's scroll box cannot clip it. -->
      <div class="menu state-menu" role="menu" [attr.aria-label]="'Move ' + m.ticket.ticketKey + ' to'"
        [style.left.px]="m.left" [style.top.px]="m.top">
        @for (s of states; track s; let first = $first) {
          <button type="button" role="menuitemradio" [attr.aria-checked]="s === m.ticket.state" [class.current]="s === m.ticket.state"
            [attr.data-first]="first ? '' : null" (click)="setState(m.ticket, s)">
            <span class="filter-swatch state-{{ slugOf(s) }}" aria-hidden="true"></span>
            <span class="grow">{{ s }}</span>
            @if (s === m.ticket.state) { <app-icon name="check" /> }
          </button>
        }
      </div>
    }

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
      <app-ticket-create [projectId]="projectId()" [folderId]="targetFolderId()" [suggestions]="suggestions()" [users]="users()" [outsiders]="outsiders()" (closed)="creating.set(false)" (created)="onCreated($event)" />
    }
    @if (ticket(); as id) {
      <app-ticket-details [ticketId]="id" [suggestions]="suggestions()" [users]="users()" [outsiders]="outsiders()" [canEdit]="canEdit()" (closed)="openTicket(null)" (changed)="refresh()" />
    }
  `,
})
export class TicketViewerPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly projectId = input.required({ transform: numberAttribute });
  /** ?ticket=<id> opens the Ticket Details window. */
  readonly ticket = input(null, { transform: (v: unknown) => (v ? Number(v) : null) });

  readonly project = signal<Project | null>(null);
  /** Contributors (and so anyone managing the project) may change tickets; Viewers may only read and comment. */
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
  /**
   * Active people who cannot be assigned yet — outside the project, or only Viewers on it. Offered
   * in "Assigned To" to those who manage the project; picking one makes them a Contributor.
   * Everyone else gets an empty list, so their picker is unchanged.
   */
  readonly outsiders = signal<UserOption[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  readonly dateFrom = signal<string | null>(null);
  readonly dateTo = signal<string | null>(null);
  readonly showDateMenu = signal(false);
  readonly draftDateFrom = signal<string | null>(null);
  readonly draftDateTo = signal<string | null>(null);
  readonly calViewMonth = signal<number>(new Date().getMonth());
  readonly calViewYear = signal<number>(new Date().getFullYear());

  readonly hasDateFilter = computed(() => !!this.dateFrom() || !!this.dateTo());
  readonly dateFilterLabel = computed(() => {
    const from = this.dateFrom();
    const to = this.dateTo();
    if (!from && !to) return 'Specific dates';
    if (from && to) {
      return from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`;
    }
    if (from) return `From ${formatShortDate(from)}`;
    return `Until ${formatShortDate(to!)}`;
  });
  readonly calMonthTitle = computed(() => `${MONTH_NAMES[this.calViewMonth()]} ${this.calViewYear()}`);
  readonly calDays = computed<CalCell[]>(() => {
    const year = this.calViewYear();
    const month = this.calViewMonth();
    const todayStr = toIsoDate(new Date());
    const from = this.draftDateFrom();
    const to = this.draftDateTo();

    const firstDay = new Date(year, month, 1, 12, 0, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0).getDate();
    const prevMonthDays = new Date(year, month, 0, 12, 0, 0).getDate();

    const cells: CalCell[] = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, d, 12, 0, 0);
      const dateStr = toIsoDate(prevDate);
      cells.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isStart: dateStr === from,
        isEnd: dateStr === to,
        inRange: !!(from && to && dateStr >= from && dateStr <= to),
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(year, month, d, 12, 0, 0);
      const dateStr = toIsoDate(currDate);
      cells.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isStart: dateStr === from,
        isEnd: dateStr === to,
        inRange: !!(from && to && dateStr >= from && dateStr <= to),
      });
    }

    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d, 12, 0, 0);
      const dateStr = toIsoDate(nextDate);
      cells.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isStart: dateStr === from,
        isEnd: dateStr === to,
        inRange: !!(from && to && dateStr >= from && dateStr <= to),
      });
    }

    return cells;
  });

  readonly search = signal('');
  /** Ticked values. Empty means no filter at all on that field. */
  readonly state = signal<string[]>([]);
  readonly type = signal<string[]>([]);
  readonly tag = signal<string[]>([]);
  /**
   * Starts ticked: people open a project to work on their own tickets. A guest has no account,
   * so nothing is theirs and they start on the whole list.
   */
  readonly mine = signal(!this.auth.isGuest());
  /** At most one panel is open at a time, so picking a filter never buries the one beside it. */
  readonly openMenu = signal<FilterMenu | null>(null);
  readonly stateLabel = computed(() => summarise(this.state(), 'states'));
  readonly typeLabel = computed(() => summarise(this.type(), 'types'));
  readonly tagLabel = computed(() => summarise(this.tag(), 'tags'));
  readonly hasFilters = computed(() =>
    !!this.search() || this.state().length > 0 || this.type().length > 0 || this.tag().length > 0 || this.mine() || this.hasDateFilter());
  readonly sortKey = signal<SortKey>('activityDate');
  readonly sortAsc = signal(false);
  /** Only "Assigned to me" is on: the toolbar keeps quiet, and the empty screen offers "Show all tickets". */
  readonly onlyMine = computed(() =>
    this.mine() && !this.search() && !this.state().length && !this.type().length && !this.tag().length && !this.hasDateFilter());
  /** The one state the chips have narrowed to, if exactly one is ticked. */
  readonly onlyState = computed(() => (this.state().length === 1 ? this.state()[0] : null));
  /**
   * The tickets in view regardless of the state filter, for the chip counts. Loaded with the list:
   * the list itself when no state is ticked, otherwise by a second request without the states.
   */
  readonly scope = signal<Ticket[]>([]);
  readonly stateCounts = computed(() => {
    const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<string, number>;
    for (const t of this.scope()) counts[t.state]++;
    return counts;
  });
  /** Share of the project's tickets that are closed, for the bar under the title. */
  readonly donePct = computed(() => {
    const p = this.project();
    return p?.ticketCount ? Math.round(((p.ticketCount - p.openTicketCount) / p.ticketCount) * 100) : 0;
  });
  /** A key in this project's own shape, not a sample project's: "e.g. STMS-NOTI-0001". */
  readonly searchHint = computed(() => {
    const code = this.project()?.projectCode;
    const folder = this.folders().find((f) => f.folderId === this.folderId()) ?? this.folders()[0];
    return code && folder ? `Search… e.g. ${code}-${folder.folderCode}-0001` : 'Search…';
  });
  /** The list row whose state menu is open, and where to draw it. */
  readonly stateMenu = signal<{ ticket: Ticket; left: number; top: number } | null>(null);
  /** The ticket whose quick state change is being saved, so its pill cannot be clicked twice. */
  readonly movingId = signal<number | null>(null);

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
    { key: 'priority', label: 'Priority', cls: 'col-priority' },
    { key: 'assignees', label: 'Assigned To', cls: 'col-assignee' },
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
      : key === 'assignees' ? this.assigneeNames(t).toLowerCase()
      : key === 'activityDate' ? t.activityDate
      : key === 'priority' ? (t.priority ?? 999)
      : (t[key] ?? '').toLowerCase();
    return [...this.tickets()].sort((a, b) => (value(a) > value(b) ? dir : value(a) < value(b) ? -dir : b.ticketId - a.ticketId));
  });

  /** Who has the ticket, for the tooltip and for sorting; empty when unassigned. */
  assigneeNames(t: Ticket) {
    return t.assignees.map((a) => a.displayName).join(', ');
  }

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const id = this.projectId();
      this.loadProject(id);
      this.loadFolders(id);
    });
    effect(() => {
      const [id, folderId, search, states, types, tags, mine, from, to] =
        [this.projectId(), this.folderId(), this.search(), this.state(), this.type(), this.tag(), this.mine(), this.dateFrom(), this.dateTo()];
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.loadTickets(id, folderId, search, states, types, tags, mine, from, to), search ? 250 : 0);
    });
    // The state menu is fixed to the viewport; if anything scrolls under it, it would float off
    // its row, so it closes. Scrolling doesn't bubble, hence the capture listener while it is open.
    effect((onCleanup) => {
      if (!this.stateMenu()) return;
      const close = () => this.stateMenu.set(null);
      window.addEventListener('scroll', close, true);
      onCleanup(() => window.removeEventListener('scroll', close, true));
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
    if (!(await this.confirm.ask({
      title: 'Delete folder?',
      message: `The empty folder “${f.folderName}” (${f.folderCode}) will be removed from this project.`,
      confirmLabel: 'Delete folder',
      tone: 'danger',
    }))) return;
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
    if (this.stateMenu() && !(target instanceof Element && target.closest('.state-menu'))) this.stateMenu.set(null);
    const insideDateWrap = target instanceof Element && target.closest('.date-filter-wrap') !== null;
    if (this.showDateMenu() && !insideDateWrap) this.showDateMenu.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.openMenu.set(null);
    this.closeStateMenu();
    this.showDateMenu.set(false);
  }

  toggleDateMenu(event: Event) {
    event.stopPropagation();
    const next = !this.showDateMenu();
    if (next) {
      this.draftDateFrom.set(this.dateFrom());
      this.draftDateTo.set(this.dateTo());
      const anchor = this.dateFrom() ?? toIsoDate(new Date());
      const [y, m] = anchor.split('-').map(Number);
      this.calViewYear.set(y);
      this.calViewMonth.set(m - 1);
      this.openMenu.set(null);
    }
    this.showDateMenu.set(next);
  }

  onCalPrevMonth() {
    let m = this.calViewMonth() - 1;
    let y = this.calViewYear();
    if (m < 0) {
      m = 11;
      y--;
    }
    this.calViewMonth.set(m);
    this.calViewYear.set(y);
  }

  onCalNextMonth() {
    let m = this.calViewMonth() + 1;
    let y = this.calViewYear();
    if (m > 11) {
      m = 0;
      y++;
    }
    this.calViewMonth.set(m);
    this.calViewYear.set(y);
  }

  onCalDayClick(dateStr: string) {
    const from = this.draftDateFrom();
    const to = this.draftDateTo();
    if (!from || (from && to)) {
      this.draftDateFrom.set(dateStr);
      this.draftDateTo.set(null);
    } else {
      if (dateStr < from) {
        this.draftDateFrom.set(dateStr);
        this.draftDateTo.set(null);
      } else {
        this.draftDateTo.set(dateStr);
      }
    }
  }

  setDraftFrom(v: string | null) {
    this.draftDateFrom.set(v || null);
    if (v) {
      const [y, m] = v.split('-').map(Number);
      this.calViewYear.set(y);
      this.calViewMonth.set(m - 1);
    }
  }

  setDraftTo(v: string | null) {
    this.draftDateTo.set(v || null);
  }

  applyPreset(preset: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth') {
    const today = new Date();
    let fromDate: Date;
    let toDate: Date = today;

    if (preset === 'today') {
      fromDate = today;
      toDate = today;
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      fromDate = y;
      toDate = y;
    } else if (preset === 'last7') {
      const f = new Date(today);
      f.setDate(today.getDate() - 6);
      fromDate = f;
      toDate = today;
    } else if (preset === 'last30') {
      const f = new Date(today);
      f.setDate(today.getDate() - 29);
      fromDate = f;
      toDate = today;
    } else {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      toDate = today;
    }

    const fromStr = toIsoDate(fromDate);
    const toStr = toIsoDate(toDate);
    this.draftDateFrom.set(fromStr);
    this.draftDateTo.set(toStr);
    this.calViewYear.set(toDate.getFullYear());
    this.calViewMonth.set(toDate.getMonth());
  }

  applyDateFilter() {
    let from = this.draftDateFrom();
    let to = this.draftDateTo();
    if (from && to && from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    this.dateFrom.set(from);
    this.dateTo.set(to ?? from);
    this.showDateMenu.set(false);
  }

  clearDateFilter(e?: Event) {
    if (e) e.stopPropagation();
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.draftDateFrom.set(null);
    this.draftDateTo.set(null);
    this.showDateMenu.set(false);
  }

  priorityLabel(p: number | null | undefined) {
    return p != null ? (PRIORITY_LABELS[p] ?? '') : '';
  }

  /** A chip narrows the list to its state; clicking the chip that is already on clears it. */
  focusState(state: string) {
    this.state.set(this.onlyState() === state ? [] : [state]);
  }

  /** Opens the row's state menu under its pill (above it near the bottom of the window). */
  openStateMenu(event: MouseEvent, t: Ticket) {
    event.stopPropagation(); // the row opens the ticket; the pill only opens its menu
    if (this.stateMenu()?.ticket.ticketId === t.ticketId) return this.closeStateMenu();
    const pill = event.currentTarget as HTMLElement;
    const r = pill.getBoundingClientRect();
    const height = STATES.length * 36 + 10;
    const top = r.bottom + 4 + height > window.innerHeight ? r.top - height - 4 : r.bottom + 4;
    this.stateMenu.set({ ticket: t, left: Math.min(r.left, window.innerWidth - 200), top });
    this.menuReturn = pill;
    setTimeout(() => document.querySelector<HTMLElement>('.state-menu [data-first]')?.focus());
  }

  private menuReturn: HTMLElement | null = null;

  private closeStateMenu() {
    if (!this.stateMenu()) return;
    this.stateMenu.set(null);
    this.menuReturn?.focus();
    this.menuReturn = null;
  }

  /**
   * The quick state change. It saves the ticket as the server has it now with only the state
   * changed, so nothing else is overwritten, and it goes through the normal update: history is
   * written and a move to Retest notifies the assignee, exactly as from the ticket window.
   */
  async setState(t: Ticket, state: TicketState) {
    this.closeStateMenu();
    if (state === t.state || this.movingId()) return;
    this.movingId.set(t.ticketId);
    try {
      const current = await this.api.ticket(t.ticketId);
      await this.api.updateTicket(t.ticketId, { ...toSaveTicket(current), state });
      this.toast.success(`${t.ticketKey} moved to ${state}.`);
      this.refresh();
    } finally {
      this.movingId.set(null);
    }
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
    this.clearDateFilter();
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
    this.loadTickets(this.projectId(), this.folderId(), this.search(), this.state(), this.type(), this.tag(), this.mine(), this.dateFrom(), this.dateTo());
  }

  private async loadFolders(id: number) {
    this.folders.set(await this.api.folders(id));
  }

  private async loadProject(id: number) {
    const [project, suggestions, users] = await Promise.all([this.api.project(id), this.api.suggestions(id), this.api.projectAssignees(id)]);
    this.project.set(project);
    this.suggestions.set(suggestions);
    this.users.set(users);

    if (canManageMembers(project.myRole)) {
      const assignable = new Set(users.map((u) => u.userId));
      this.outsiders.set((await this.api.userOptions()).filter((u) => !assignable.has(u.userId)));
    } else {
      this.outsiders.set([]);
    }
  }

  private async loadTickets(
    id: number,
    folderId: number | null,
    search: string,
    states: string[],
    types: string[],
    tags: string[],
    mine: boolean,
    dateFrom: string | null = null,
    dateTo: string | null = null,
  ) {
    try {
      const assignedTo = mine ? this.auth.user()?.userId : null;
      const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00').toISOString() : null;
      const toDate = dateTo ? new Date(dateTo + 'T23:59:59.999').toISOString() : null;
      const filters = { folderId, search, states, types, tags, assignedTo, fromDate, toDate };
      // The chip counts need the view without its state filter. Asked first, so the list's own
      // request is always the latest one sent.
      const scope = states.length ? this.api.tickets(id, { ...filters, states: [] }) : null;
      const list = await this.api.tickets(id, filters);
      this.tickets.set(list);
      this.scope.set(scope ? await scope : list);
    } finally {
      this.loading.set(false);
    }
  }
}
