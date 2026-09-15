import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Project, STATES, Suggestions, Ticket, UserOption, initials, slug } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { TicketCreate } from '../../shared/ticket-create';
import { TicketDetails } from '../../shared/ticket-details';
import { Topbar } from '../../shared/topbar';

type SortKey = 'ticketId' | 'title' | 'assignedToName' | 'state' | 'tags' | 'activityDate';

@Component({
  selector: 'app-ticket-viewer',
  imports: [FormsModule, DatePipe, Topbar, TicketCreate, TicketDetails],
  template: `
    <app-topbar [crumb]="project()?.projectName ?? null">
      <button class="btn btn-primary" (click)="creating.set(true)">+ Create ticket</button>
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>{{ project()?.projectName ?? 'Tickets' }}</h1>
          @if (project(); as p) {
            <p class="muted">Project ID {{ p.projectId }} · {{ p.openTicketCount }} open of {{ p.ticketCount }} tickets</p>
          }
        </div>
      </div>

      <section class="card">
        <div class="toolbar">
          <input class="search" type="search" placeholder="Search title, assignee or #ID…" aria-label="Search tickets"
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
                      <a [href]="'/projects/' + projectId() + '?ticket=' + t.ticketId" (click)="$event.preventDefault()">#{{ t.ticketId }}</a>
                    </td>
                    <td class="title-cell">
                      {{ t.title }}
                      @if (t.commentCount) { <span class="muted small" [title]="t.commentCount + ' comment(s)'">💬 {{ t.commentCount }}</span> }
                    </td>
                    <td>
                      @if (t.assignedToName) { <span class="person"><span class="avatar avatar-sm" aria-hidden="true">{{ initialsOf(t.assignedToName) }}</span>{{ t.assignedToName }}</span> } @else { <span class="muted">Unassigned</span> }
                    </td>
                    <td><span class="state state-{{ slugOf(t.state) }}">{{ t.state }}</span></td>
                    <td>
                      <span class="tags">
                        @for (tag of t.tags; track tag) { <span class="tag">{{ tag }}</span> }
                      </span>
                    </td>
                    <td class="nowrap muted">{{ t.activityDate | date: 'MMM d, y, h:mm a' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </main>

    @if (creating()) {
      <app-ticket-create [projectId]="projectId()" [suggestions]="suggestions()" [users]="users()" (closed)="creating.set(false)" (created)="onCreated($event)" />
    }
    @if (ticket(); as id) {
      <app-ticket-details [ticketId]="id" [suggestions]="suggestions()" [users]="users()" (closed)="openTicket(null)" (changed)="refresh()" />
    }
  `,
})
export class TicketViewerPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly projectId = input.required({ transform: numberAttribute });
  /** ?ticket=<id> opens the Ticket Details window. */
  readonly ticket = input(null, { transform: (v: unknown) => (v ? Number(v) : null) });

  readonly project = signal<Project | null>(null);
  readonly tickets = signal<Ticket[]>([]);
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
    { key: 'ticketId', label: 'ID', cls: 'w-id' },
    { key: 'title', label: 'Title', cls: '' },
    { key: 'assignedToName', label: 'Assigned To', cls: '' },
    { key: 'state', label: 'State', cls: '' },
    { key: 'tags', label: 'Tag', cls: '' },
    { key: 'activityDate', label: 'Activity Date', cls: '' },
  ];

  readonly sorted = computed(() => {
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    const value = (t: Ticket): string | number =>
      key === 'ticketId' ? t.ticketId
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
    });
    effect(() => {
      const [id, search, state, tag, mine] = [this.projectId(), this.search(), this.state(), this.tag(), this.mine()];
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.loadTickets(id, search, state, tag, mine), search ? 250 : 0);
    });
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortAsc.update((v) => !v);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(key !== 'activityDate');
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
    this.loadTickets(this.projectId(), this.search(), this.state(), this.tag(), this.mine());
  }

  private async loadProject(id: number) {
    const [project, suggestions, users] = await Promise.all([this.api.project(id), this.api.suggestions(id), this.api.userOptions()]);
    this.project.set(project);
    this.suggestions.set(suggestions);
    this.users.set(users);
  }

  private async loadTickets(id: number, search: string, state: string, tag: string, mine: boolean) {
    try {
      const assignedTo = mine ? this.auth.user()?.userId : null;
      this.tickets.set(await this.api.tickets(id, { search, state, tag, assignedTo }));
    } finally {
      this.loading.set(false);
    }
  }
}
