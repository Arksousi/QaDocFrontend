import { Component, computed, input, model } from '@angular/core';
import { MAX_ASSIGNEES, TicketAssignee, UserOption, avatarTone, initials, loadLabel, overLimit } from '../core/models';
import { Icon } from './icon';
import { UserCardTrigger } from './user-card';

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

/** The question itself: "Mohammad is at their limit (5/5). Assign anyway?" */
export function confirmOverLimit(people: UserOption[]): boolean {
  if (!people.length) return true;
  const who = people.map((u) => `${u.displayName} (${loadLabel(u.openTickets, u.ticketLimit)})`).join(', ');
  const verb = people.length === 1 ? 'is at their ticket limit' : 'are at their ticket limits';
  return confirm(`${who} ${verb}.\n\nAssign anyway?`);
}

/**
 * "Assigned To" with room for several people: a chip per person, and a dropdown to add the next.
 * Styled as the tag input beside it, so the two multi-value fields in a ticket look alike.
 *
 * `outsiders` is only filled for someone who manages the project; they appear in a second group,
 * and the API makes whoever is picked from it a Contributor when the ticket is saved.
 */
@Component({
  selector: 'app-assignee-picker',
  imports: [UserCardTrigger, Icon],
  template: `
    <div class="tag-input assignee-picker" [class.tag-input-readonly]="readonly()">
      @for (id of selected(); track id) {
        <span class="tag assignee-chip" [class.assignee-over]="wouldExceed(id)" [title]="byLine(id)">
          <span class="avatar avatar-sm avatar-t{{ toneOf(nameOf(id)) }}" [appUserCard]="id" aria-hidden="true">{{ initialsOf(nameOf(id)) }}</span>
          {{ nameOf(id) }}
          @if (wouldExceed(id)) { <app-icon name="alert" class="assignee-over-icon" label="Over their ticket limit" /> }
          @if (!readonly()) {
            <button type="button" class="tag-remove" (click)="remove(id)" [attr.aria-label]="'Unassign ' + nameOf(id)"><app-icon name="close" /></button>
          }
        </span>
      } @empty {
        @if (readonly()) { <span class="muted">Unassigned</span> }
      }
      @if (!readonly() && canAdd()) {
        <!-- A plain (change) handler rather than ngModel: the select is a one-shot action that
             snaps back to its prompt, which a bound value cannot do when it never changes. -->
        <select class="assignee-add" [attr.aria-label]="'Add a person to ' + label()" (change)="add($event)">
          <option value="">{{ selected().length ? 'Add another…' : 'Unassigned — add a person…' }}</option>
          @if (freeOutsiders().length) {
            <optgroup label="On this project">
              @for (u of freeMembers(); track u.userId) { <option [value]="u.userId">{{ optionLabel(u) }}</option> }
            </optgroup>
            <optgroup label="Add to project as Contributor">
              @for (u of freeOutsiders(); track u.userId) { <option [value]="u.userId">{{ optionLabel(u) }}</option> }
            </optgroup>
          } @else {
            @for (u of freeMembers(); track u.userId) { <option [value]="u.userId">{{ optionLabel(u) }}</option> }
          }
        </select>
      }
    </div>
  `,
})
export class AssigneePicker {
  /** People on the project who may be assigned. */
  readonly members = input<UserOption[]>([]);
  readonly outsiders = input<UserOption[]>([]);
  /** Who is on the ticket now, with who assigned them; names people no longer in either list. */
  readonly current = input<TicketAssignee[]>([]);
  readonly readonly = input(false);
  /** What the control is called, for the dropdown's accessible name. */
  readonly label = input('this ticket');
  readonly selected = model<number[]>([]);

  readonly toneOf = avatarTone;
  readonly initialsOf = initials;

  private readonly names = computed(() => {
    const map = new Map<number, string>();
    for (const a of this.current()) map.set(a.userId, a.displayName);
    for (const u of [...this.members(), ...this.outsiders()]) map.set(u.userId, u.displayName);
    return map;
  });
  readonly freeMembers = computed(() => this.members().filter((u) => !this.selected().includes(u.userId)));
  readonly freeOutsiders = computed(() => this.outsiders().filter((u) => !this.selected().includes(u.userId)));
  readonly canAdd = computed(() =>
    this.selected().length < MAX_ASSIGNEES && this.freeMembers().length + this.freeOutsiders().length > 0);

  nameOf(id: number) {
    return this.names().get(id) ?? `User #${id}`;
  }

  private readonly options = computed(() => new Map([...this.members(), ...this.outsiders()].map((u) => [u.userId, u])));

  /** "Mohammad — 4/5", with "· full" when one more would take them past it. */
  optionLabel(u: UserOption) {
    const full = overLimit(u.openTickets, u.ticketLimit, 1);
    return `${u.displayName} — ${loadLabel(u.openTickets, u.ticketLimit)}${full ? ' · full' : ''}`;
  }

  /** Whether this pick, once saved, leaves them over their limit. */
  wouldExceed(id: number) {
    return exceedsWith(this.options().get(id), this.current().some((a) => a.userId === id));
  }

  /** Who put them there, once saved; someone just picked has not been assigned by anyone yet. */
  byLine(id: number) {
    const by = this.current().find((a) => a.userId === id)?.assignedByName;
    const u = this.options().get(id);
    const load = u ? ` · ${loadLabel(u.openTickets, u.ticketLimit)} open` : '';
    return (by ? `${this.nameOf(id)} · assigned by ${by}` : this.nameOf(id)) + load;
  }

  add(event: Event) {
    const select = event.target as HTMLSelectElement;
    const id = Number(select.value);
    select.value = '';
    if (id && !this.selected().includes(id)) this.selected.set([...this.selected(), id]);
  }

  remove(id: number) {
    this.selected.set(this.selected().filter((x) => x !== id));
  }
}
