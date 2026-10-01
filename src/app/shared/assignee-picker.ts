import { Component, ElementRef, HostListener, computed, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';
import { TicketAssignee, UserOption, avatarTone, initials, loadLabel, overLimit } from '../core/models';
import { Icon } from './icon';
import { Avatar } from './avatar';

/**
 * Whether this person ends up over their limit once the ticket is saved. Someone already on it is
 * already counted in their openTickets; someone being added brings one more.
 */
function exceedsWith(u: UserOption | undefined, alreadyOnTicket: boolean): boolean {
  return !!u && overLimit(u.openTickets, u.ticketLimit, alreadyOnTicket ? 0 : 1);
}

/**
 * People being added who would go over their limit, for the "assign anyway?" question on save.
 * Only newcomers: someone already on the ticket was asked about when they were added.
 */
export function newlyOverLimit(options: UserOption[], selected: number[], current: number[]): UserOption[] {
  return options.filter((u) => selected.includes(u.userId) && !current.includes(u.userId) && exceedsWith(u, false));
}

/** The question itself, in the app's own dialog: "Rana is at their ticket limit. Assign anyway?" */
export function confirmOverLimit(confirm: ConfirmService, people: UserOption[]): Promise<boolean> {
  if (!people.length) return Promise.resolve(true);
  const [first] = people;
  return confirm.ask({
    title: 'Assign anyway?',
    message: people.length === 1
      ? `${first.displayName} is at their ticket limit. This ticket would take them over it.`
      : `${people.map((u) => u.displayName).join(', ')} are at their ticket limits.`,
    confirmLabel: 'Assign anyway',
    tone: 'warning',
    person: people.length === 1 ? first : undefined,
  });
}

/** How loaded someone is: no limit set, comfortable, nearly full (75% or more), or full (one more goes over). */
type Load = 'none' | 'ok' | 'near' | 'full';

interface Row {
  /** null is "Unassigned". */
  user: UserOption | null;
  group: 'none' | 'members' | 'outsiders';
}

/** The search box appears once the list is long enough that scanning it is slower than typing. */
const SEARCH_FROM = 7;

let nextId = 0;

/**
 * "Assigned To": a button that shows who has the ticket, opening a list of people — avatar, name,
 * and their load against their ticket limit as a small bar and a number — with a search box once
 * the list is long. Someone nearly full turns amber, someone who would go over turns red and says
 * "Full", so the warning never rests on colour alone.
 *
 * The list is fixed to the viewport, not the form, so a dialog's scrolling body cannot clip it;
 * it flips above the button when there is no room below.
 *
 * `outsiders` is only filled for someone who manages the project; they appear in a second group,
 * and the API makes whoever is picked from it a Contributor when the ticket is saved.
 */
@Component({
  selector: 'app-assignee-picker',
  imports: [Avatar, Icon],
  template: `
    <button #trigger type="button" class="picker-trigger" [class.picker-over]="overNow()" [class.picker-open]="open()"
      [disabled]="readonly()" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="listId"
      [attr.aria-label]="label() + ': ' + (picked() ? nameOf(picked()!) : 'Unassigned')"
      [title]="picked() ? byLine(picked()!) : 'Unassigned'"
      (click)="toggle()" (keydown)="onTriggerKey($event)">
      @if (picked(); as id) {
        <app-avatar size="sm" [userId]="id" [name]="nameOf(id)" [card]="false" />
        <span class="picker-value">{{ nameOf(id) }}</span>
      } @else {
        <span class="picker-none-mark" aria-hidden="true"></span>
        <span class="picker-value picker-placeholder">Unassigned</span>
      }
      @if (!readonly()) { <app-icon name="caret" class="picker-caret" /> }
    </button>
    @if (overNow()) {
      <span class="hint picker-over-hint">{{ nameOf(picked()!) }} is over their ticket limit.</span>
    }

    @if (open()) {
      <div class="picker-panel"
        [style.left.px]="placement().left" [style.width.px]="placement().width"
        [style.top.px]="placement().up ? null : placement().top"
        [style.bottom.px]="placement().up ? placement().bottom : null">
        @if (searchable()) {
          <div class="picker-search">
            <app-icon name="search" />
            <input #search type="text" placeholder="Search people…" autocomplete="off" spellcheck="false"
              role="combobox" aria-autocomplete="list" [attr.aria-controls]="listId" aria-expanded="true"
              [attr.aria-activedescendant]="activeId()" aria-label="Search people"
              [value]="query()" (input)="onSearch($event)" (keydown)="onListKey($event)" />
          </div>
        }
        <div #list class="picker-list" role="listbox" [id]="listId" [attr.aria-label]="label()" tabindex="-1"
          [attr.aria-activedescendant]="searchable() ? null : activeId()" (keydown)="onListKey($event)">
          @for (r of rows(); track r.user?.userId ?? 0; let i = $index) {
            @if (headingBefore(i); as heading) {
              <div class="picker-group" role="presentation">{{ heading }}</div>
            }
            <div class="picker-option" role="option" [id]="listId + '-' + i"
              [attr.aria-selected]="isPicked(r)" [class.active]="i === active()" [class.picked]="isPicked(r)"
              (mousemove)="active.set(i)" (mousedown)="$event.preventDefault()" (click)="choose(r)">
              @if (r.user; as u) {
                <app-avatar size="sm" [userId]="u.userId" [name]="u.displayName" [card]="false" />
                <span class="picker-name">{{ u.displayName }}</span>
                <span class="picker-check">@if (isPicked(r)) { <app-icon name="check" /> }</span>
                <span class="picker-load picker-load-{{ loadOf(u) }}" [attr.aria-label]="loadText(u)">
                  @if (u.ticketLimit != null) {
                    <span class="picker-bar" aria-hidden="true"><span [style.width.%]="barPct(u)"></span></span>
                  }
                  <span class="picker-count" aria-hidden="true">{{ loadOf(u) === 'full' ? 'Full' : shortLoad(u) }}</span>
                </span>
              } @else {
                <span class="picker-none-mark" aria-hidden="true"></span>
                <span class="picker-name picker-placeholder">Unassigned</span>
                <span class="picker-check">@if (isPicked(r)) { <app-icon name="check" /> }</span>
              }
            </div>
          } @empty {
            <p class="picker-empty">No one matches “{{ query() }}”.</p>
          }
        </div>
      </div>
    }
  `,
})
export class AssigneePicker {
  /** People on the project who may be assigned. */
  readonly members = input<UserOption[]>([]);
  readonly outsiders = input<UserOption[]>([]);
  /** Who is on the ticket now, with who assigned them; names people no longer in either list. */
  readonly current = input<TicketAssignee[]>([]);
  readonly readonly = input(false);
  /** What the control is called, for its accessible name. */
  readonly label = input('Assigned To');
  /** The API's shape: a list of at most one id. */
  readonly selected = model<number[]>([]);

  readonly toneOf = avatarTone;
  readonly initialsOf = initials;
  readonly listId = `assignee-list-${nextId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);
  readonly placement = signal({ left: 0, width: 0, top: 0, bottom: 0, up: false });

  readonly picked = computed<number | null>(() => this.selected()[0] ?? null);
  private readonly options = computed(() => new Map([...this.members(), ...this.outsiders()].map((u) => [u.userId, u])));
  readonly searchable = computed(() => this.members().length + this.outsiders().length >= SEARCH_FROM);

  /** Everything the list shows, filtered by the search, in display order. */
  readonly rows = computed<Row[]>(() => {
    const q = this.query().trim().toLowerCase();
    const match = (u: UserOption) => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    const rows: Row[] = q ? [] : [{ user: null, group: 'none' }];
    // Still on the ticket but in neither list (they lost access): listed, so it still says who has it.
    const id = this.picked();
    if (id !== null && !this.options().has(id)) {
      const former: UserOption = { userId: id, displayName: this.nameOf(id), username: '', openTickets: 0, ticketLimit: null };
      if (match(former)) rows.push({ user: former, group: 'members' });
    }
    for (const u of this.members()) if (match(u)) rows.push({ user: u, group: 'members' });
    for (const u of this.outsiders()) if (match(u)) rows.push({ user: u, group: 'outsiders' });
    return rows;
  });

  readonly activeId = computed(() => (this.rows().length ? `${this.listId}-${this.active()}` : null));

  /** Whether the pick, once saved, leaves them over their limit. Someone already on it is already counted. */
  readonly overNow = computed(() => {
    const id = this.picked();
    const u = id === null ? undefined : this.options().get(id);
    return exceedsWith(u, this.current().some((a) => a.userId === id));
  });

  /** A group heading goes above the first row of each group, once there is more than one group. */
  headingBefore(i: number): string | null {
    if (!this.outsiders().length) return null;
    const rows = this.rows();
    const group = rows[i].group;
    if (group === 'none' || (i > 0 && rows[i - 1].group === group)) return null;
    return group === 'members' ? 'On this project' : 'Add to project as Contributor';
  }

  isPicked(r: Row) {
    return (r.user?.userId ?? null) === this.picked();
  }

  nameOf(id: number) {
    return this.options().get(id)?.displayName ?? this.current().find((a) => a.userId === id)?.displayName ?? `User #${id}`;
  }

  loadOf(u: UserOption): Load {
    if (u.ticketLimit == null) return 'none';
    const onTicket = this.current().some((a) => a.userId === u.userId);
    if (exceedsWith(u, onTicket)) return 'full';
    return u.openTickets / u.ticketLimit >= 0.75 ? 'near' : 'ok';
  }

  barPct(u: UserOption) {
    return u.ticketLimit ? Math.min(100, Math.round((u.openTickets / u.ticketLimit) * 100)) : 0;
  }

  /** "7/9", or "3 open" with no limit. */
  shortLoad(u: UserOption) {
    return loadLabel(u.openTickets, u.ticketLimit);
  }

  /** What a screen reader hears for the load column. */
  loadText(u: UserOption) {
    const base = u.ticketLimit != null ? `${u.openTickets} of ${u.ticketLimit} tickets` : `${u.openTickets} open tickets, no limit`;
    return this.loadOf(u) === 'full' ? `${base}, full` : base;
  }

  /** The button's tooltip: who put them there, once saved, and their load. */
  byLine(id: number) {
    const by = this.current().find((a) => a.userId === id)?.assignedByName;
    const u = this.options().get(id);
    const load = u ? ` · ${loadLabel(u.openTickets, u.ticketLimit)} open` : '';
    return (by ? `${this.nameOf(id)} · assigned by ${by}` : this.nameOf(id)) + load;
  }

  toggle() {
    if (this.open()) this.close(false);
    else this.show();
  }

  private show() {
    this.query.set('');
    this.active.set(Math.max(0, this.rows().findIndex((r) => this.isPicked(r))));
    this.place();
    this.open.set(true);
    // Once the panel is drawn: focus the search (or the list itself) and bring the pick into view.
    setTimeout(() => {
      (this.search()?.nativeElement ?? this.list()?.nativeElement)?.focus();
      this.scrollActiveIntoView();
    });
  }

  close(refocus = true) {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  /** Under the button, as wide as it within 340–440px (a full-width field would push the load far from the name), or above it when the space below runs out. */
  private place() {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 340), 440, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    this.placement.set({ left, width, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, up });
  }

  choose(r: Row) {
    this.selected.set(r.user ? [r.user.userId] : []);
    this.close();
  }

  onSearch(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  onTriggerKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) this.show();
    }
  }

  onListKey(event: KeyboardEvent) {
    const count = this.rows().length;
    const move = (to: number) => {
      event.preventDefault();
      if (!count) return;
      this.active.set((to + count) % count);
      this.scrollActiveIntoView();
    };
    switch (event.key) {
      case 'ArrowDown': return move(this.active() + 1);
      case 'ArrowUp': return move(this.active() - 1);
      case 'Home': return move(0);
      case 'End': return move(count - 1);
      case 'Enter': {
        event.preventDefault();
        const row = this.rows()[this.active()];
        if (row) this.choose(row);
        return;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // closes the list, not the dialog around it
        return this.close();
      case 'Tab':
        return this.close(false);
    }
  }

  private scrollActiveIntoView() {
    setTimeout(() => document.getElementById(`${this.listId}-${this.active()}`)?.scrollIntoView({ block: 'nearest' }));
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentDown(event: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  /** The panel is fixed to the viewport, so anything scrolling under it would leave it behind. */
  @HostListener('window:resize')
  protected onResize() {
    this.close(false);
  }

  /**
   * Scrolling doesn't bubble, so a dialog body scrolling under the panel is only heard in the
   * capture phase. Listened to only while open; scrolling the list itself is left alone.
   */
  private readonly onScroll = (event: Event) => {
    if (!this.list()?.nativeElement.contains(event.target as Node)) this.close(false);
  };

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) return;
      window.addEventListener('scroll', this.onScroll, true);
      onCleanup(() => window.removeEventListener('scroll', this.onScroll, true));
    });
  }
}
