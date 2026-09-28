import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { UserWorkload, avatarTone, initials, loadLabel, overLimit } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Topbar } from '../../shared/topbar';

interface WorkloadRow extends UserWorkload {
  /** How much of their limit is used, 0–100; capped so an overloaded bar still fits its track. */
  pct: number;
  /** At their limit: one more ticket would be too many. */
  full: boolean;
  /** Already past it. */
  over: boolean;
}

/**
 * Admins and Leaders: how many unfinished tickets each person holds across every project, against
 * their limit, fullest first. A planning view — nothing here stops an assignment. Admins can change
 * a limit in place; Leaders only read.
 */
@Component({
  selector: 'app-users-dashboard',
  imports: [Topbar],
  template: `
    <app-topbar crumb="Users Dashboard" />

    <main class="page">
      <div class="page-header">
        <div>
          <h1>Users Dashboard</h1>
          <p class="muted">
            Unfinished tickets each person holds across all projects, against their limit.
            @if (!loading()) { {{ fullCount() }} of {{ rows().length }} at or over their limit. }
          </p>
        </div>
      </div>

      <section class="card">
        @if (loading()) {
          <p class="muted pad" role="status">Loading…</p>
        } @else {
          <div class="table-wrap">
            <table class="table workload-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th class="col-grow">Load</th><th class="num">Open</th><th class="num">Limit</th><th><span class="sr-only">Status</span></th></tr>
              </thead>
              <tbody>
                @for (u of rows(); track u.userId) {
                  <tr>
                    <td>
                      <span class="person">
                        <span class="avatar avatar-sm avatar-t{{ toneOf(u.displayName) }}" aria-hidden="true">{{ initialsOf(u.displayName) }}</span>
                        {{ u.displayName }}
                      </span>
                    </td>
                    <td><span class="role role-{{ u.role.toLowerCase() }}">{{ u.role }}</span></td>
                    <td class="col-grow">
                      @if (u.ticketLimit != null) {
                        <span class="score-bar" [class.load-bar-full]="u.full" role="progressbar" aria-valuemin="0"
                          [attr.aria-valuemax]="u.ticketLimit" [attr.aria-valuenow]="u.openTickets"
                          [attr.aria-label]="u.displayName + ': ' + labelOf(u)">
                          <span [style.width.%]="u.pct"></span>
                        </span>
                      } @else {
                        <span class="muted small">No limit</span>
                      }
                    </td>
                    <td class="num">{{ u.openTickets }}</td>
                    <td class="num">
                      @if (auth.isAdmin()) {
                        <!-- Saved on change (blur or Enter). Emptying it clears the limit. -->
                        <input class="limit-input" type="number" min="1" max="100" step="1" placeholder="—"
                          [value]="u.ticketLimit ?? ''" [attr.aria-label]="'Ticket limit for ' + u.displayName"
                          [disabled]="savingId() === u.userId" (change)="saveLimit(u, $event)" />
                      } @else {
                        @if (u.ticketLimit != null) { {{ u.ticketLimit }} } @else { <span class="muted">—</span> }
                      }
                    </td>
                    <td>
                      @if (u.over) {
                        <span class="load-chip load-full">Over</span>
                      } @else if (u.full) {
                        <span class="load-chip load-full">Full</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted center">No active users.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </main>
  `,
})
export class UsersDashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly people = signal<UserWorkload[]>([]);
  readonly loading = signal(true);
  readonly savingId = signal<number | null>(null);
  readonly toneOf = avatarTone;
  readonly initialsOf = initials;

  readonly rows = computed<WorkloadRow[]>(() =>
    this.people().map((u) => ({
      ...u,
      pct: u.ticketLimit ? Math.min(100, Math.round((u.openTickets / u.ticketLimit) * 100)) : 0,
      full: overLimit(u.openTickets, u.ticketLimit, 1),
      over: overLimit(u.openTickets, u.ticketLimit),
    })),
  );
  readonly fullCount = computed(() => this.rows().filter((u) => u.full).length);

  async ngOnInit() {
    try {
      this.people.set(await this.api.userWorkload());
    } finally {
      this.loading.set(false);
    }
  }

  labelOf(u: UserWorkload) {
    return `${loadLabel(u.openTickets, u.ticketLimit)} unfinished tickets`;
  }

  async saveLimit(u: UserWorkload, event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim();
    const limit = raw === '' ? null : Number(raw);
    if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= 100)) {
      this.toast.error('Ticket limit must be a whole number from 1 to 100, or empty for no limit.');
      input.value = u.ticketLimit?.toString() ?? '';
      return;
    }
    if (limit === u.ticketLimit) return;

    this.savingId.set(u.userId);
    try {
      await this.api.setTicketLimit(u.userId, limit);
      this.people.update((list) => list.map((p) => (p.userId === u.userId ? { ...p, ticketLimit: limit } : p)));
      this.toast.success(limit === null ? `${u.displayName} has no limit now.` : `${u.displayName}'s limit is now ${limit}.`);
    } catch {
      // The interceptor has already said why; put the old value back so the field tells the truth.
      input.value = u.ticketLimit?.toString() ?? '';
    } finally {
      this.savingId.set(null);
    }
  }
}
