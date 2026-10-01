import { Component, ElementRef, afterRenderEffect, computed, input, viewChild } from '@angular/core';
import { Ticket, TicketState, avatarTone, initials, slug } from '../core/models';
import { Avatar } from './avatar';

interface Step {
  /** "30 Sept - 11:39 AM". */
  when: string;
  at: string;
  /** Who made the move, written above the arrow. */
  by: string;
  byId: number | null;
  /** The state the ticket landed in. */
  state: TicketState;
}

/** Month names as the graph writes them: "Sept", not "Sep", as in "30 Sept - 11:39 AM". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} - ${time}`;
}

/**
 * The ticket's journey through its states, left to right: an arrow for each move — who made it
 * above, when below — then the state it reached.
 * Built from the saved history, so it shows what happened, not what an unsaved edit is about to do.
 */
@Component({
  selector: 'app-state-graph',
  imports: [Avatar],
  template: `
    <div #graph class="state-graph" role="list" aria-label="State history">
      @for (s of steps(); track $index) {
        <div class="sg-move" role="listitem">
          <span class="sg-by">
            <app-avatar size="sm" [userId]="s.byId" [name]="s.by" />
            {{ s.by }}
          </span>
          <span class="sg-arrow" aria-hidden="true"></span>
          <time class="sg-at" [attr.datetime]="s.at">{{ s.when }}</time>
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

  readonly slugOf = slug;
  readonly toneOf = avatarTone;
  readonly initialsOf = initials;

  private readonly graph = viewChild.required<ElementRef<HTMLElement>>('graph');

  constructor() {
    // A long journey scrolls sideways; start at the end, so the state it is in now is on screen.
    afterRenderEffect(() => {
      this.steps();
      const el = this.graph().nativeElement;
      el.scrollLeft = el.scrollWidth;
    });
  }

  readonly steps = computed<Step[]>(() => {
    const t = this.ticket();
    // History arrives newest first; the graph reads oldest first.
    const history = [...t.history].reverse();
    const created = history.find((h) => h.field === 'Created');
    const moves = history.filter((h) => h.field === 'State' && h.newValue);
    const step = (at: string, by: string, byId: number | null, state: TicketState): Step =>
      ({ when: formatWhen(at), at, by, byId, state });

    // Where it started: the state the first move left, or — never moved — where it is now.
    const first = (moves[0]?.oldValue ?? t.state) as TicketState;
    return [
      step(created?.changedAt ?? t.createdAt, created?.userName ?? t.createdByName ?? 'Unknown user', created?.userId ?? null, first),
      ...moves.map((h) => step(h.changedAt, h.userName, h.userId, h.newValue as TicketState)),
    ];
  });
}
