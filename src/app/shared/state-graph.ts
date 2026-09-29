import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Ticket, TicketState, avatarTone, initials, slug } from '../core/models';
import { UserCardTrigger } from './user-card';

interface Step {
  /** What happened, written on the arrow: New, Started, Fixed… */
  label: string;
  by: string;
  byId: number | null;
  at: string;
  /** The state the ticket landed in. */
  state: TicketState;
}

/** The word on the arrow into each state. Tickets carry no reason for a change, so this says what the move means. */
const VERB: Record<TicketState, string> = {
  Open: 'Reopened',
  'In Progress': 'Started',
  Resolved: 'Fixed',
  Retest: 'Sent to retest',
  Closed: 'Closed',
};

/**
 * The ticket's journey through its states, left to right: an arrow for each move — who made it,
 * and when — then the state it reached. Built from the saved history, so it shows what happened,
 * not what an unsaved edit is about to do.
 */
@Component({
  selector: 'app-state-graph',
  imports: [DatePipe, UserCardTrigger],
  template: `
    <div class="state-graph" role="list" aria-label="State history">
      @for (s of steps(); track $index) {
        <div class="sg-move" role="listitem">
          <span class="sg-label">{{ s.label }}</span>
          <span class="sg-arrow" aria-hidden="true"></span>
          <span class="sg-by">
            <span class="avatar avatar-sm avatar-t{{ toneOf(s.by) }}" [appUserCard]="s.byId" aria-hidden="true">{{ initialsOf(s.by) }}</span>
            {{ s.by }}
          </span>
          <time class="sg-at" [attr.datetime]="s.at">{{ s.at | date: 'M/d/y' }}</time>
        </div>
        <div class="sg-state" [class.sg-current]="$last">
          <span class="sg-dot sg-dot-{{ slugOf(s.state) }}" aria-hidden="true"></span>
          {{ s.state }}
        </div>
      }
    </div>
  `,
})
export class StateGraph {
  readonly ticket = input.required<Ticket>();

  readonly toneOf = avatarTone;
  readonly initialsOf = initials;
  readonly slugOf = slug;

  readonly steps = computed<Step[]>(() => {
    const t = this.ticket();
    // History arrives newest first; the graph reads oldest first.
    const history = [...t.history].reverse();
    const created = history.find((h) => h.field === 'Created');
    const moves = history.filter((h) => h.field === 'State' && h.newValue);

    // Where it started: the state the first move left, or — never moved — where it is now.
    const first = (moves[0]?.oldValue ?? t.state) as TicketState;
    return [
      {
        label: 'New',
        by: created?.userName ?? t.createdByName ?? 'Unknown user',
        byId: created?.userId ?? null,
        at: created?.changedAt ?? t.createdAt,
        state: first,
      },
      ...moves.map((h) => ({
        label: VERB[h.newValue as TicketState] ?? 'Changed',
        by: h.userName,
        byId: h.userId,
        at: h.changedAt,
        state: h.newValue as TicketState,
      })),
    ];
  });
}
