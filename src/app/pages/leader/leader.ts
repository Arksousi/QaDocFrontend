import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { MemberScore, ProjectScoreboard, avatarTone, initials } from '../../core/models';
import { Avatar } from '../../shared/avatar';

interface MemberRow extends MemberScore {
  /** Share of their assigned tickets that are Closed, 0–100. Nobody-assigned reads as 0, not NaN. */
  pct: number;
}

interface ScoreCard {
  project: ProjectScoreboard;
  /** Closed share of the whole project, 0–100: how much of the ring is filled. */
  donePct: number;
  members: MemberRow[];
}

/**
 * Leader tab of the merged Dashboard: every project the person is on, each with its open-ticket
 * ring and per-member progress. The Dashboard page owns the topbar, heading and tabs.
 */
@Component({
  selector: 'app-leader',
  imports: [Avatar, RouterLink],
  template: `
    @if (!loading() && cards().length) {
      <p class="muted">{{ cards().length }} {{ cards().length === 1 ? 'project' : 'projects' }} · {{ openTotal() }} opened tickets across them</p>
    }

    @if (loading()) {
        <div aria-hidden="true">
          @for (i of placeholders; track i) { <div class="skeleton skeleton-score card"></div> }
        </div>
        <p class="sr-only" role="status">Loading projects…</p>
      } @else {
        @for (c of cards(); track c.project.projectId) {
          <section class="card score-card" [attr.aria-labelledby]="'score-' + c.project.projectId">
            <div class="card-head">
              <div class="score-title">
                <span class="id-chip">{{ c.project.projectCode }}</span>
                <h2 [id]="'score-' + c.project.projectId">{{ c.project.projectName }}</h2>
                @if (c.project.myRole === 'Manager') {
                  <span class="role role-leader">Manages</span>
                } @else if (c.project.myRole) {
                  <span class="muted small">{{ c.project.myRole }}</span>
                }
              </div>
              <a class="btn btn-ghost btn-sm" [routerLink]="['/projects', c.project.projectId]">Open project</a>
            </div>

            <div class="score-body">
              <figure class="kpi" role="img"
                [attr.aria-label]="c.project.openTicketCount + ' of ' + c.project.ticketCount + ' tickets still open'">
                <svg class="kpi-ring" viewBox="0 0 120 120" aria-hidden="true">
                  <circle class="kpi-track" cx="60" cy="60" r="52" />
                  <!-- pathLength 100 lets the dash be the percentage itself, whatever the radius. -->
                  <circle class="kpi-fill" cx="60" cy="60" r="52" pathLength="100"
                    [attr.stroke-dasharray]="c.donePct + ' 100'" />
                </svg>
                <div class="kpi-value">
                  <strong>{{ c.project.openTicketCount }}</strong>
                  <span>of {{ c.project.ticketCount }}</span>
                </div>
                <figcaption>Opened Tickets</figcaption>
              </figure>

              <div class="score-members">
                <h3 class="section-title">Contributors</h3>
                @for (m of c.members; track m.userId) {
                  <div class="score-row" [class.row-inactive]="!m.isActive">
                    <span class="person">
                      <app-avatar size="sm" [userId]="m.userId" [name]="m.displayName" />
                      <span class="score-name">{{ m.displayName }}@if (!m.isActive) { <span class="muted small"> (deactivated)</span> }</span>
                    </span>
                    <span class="score-bar" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="m.assigned"
                      [attr.aria-valuenow]="m.closed" [attr.aria-label]="m.displayName + ': ' + m.closed + ' of ' + m.assigned + ' assigned tickets closed'">
                      <span [style.width.%]="m.pct"></span>
                    </span>
                    <span class="score-count muted small">{{ m.closed }}/{{ m.assigned }}</span>
                  </div>
                } @empty {
                  <p class="muted small">No tickets are assigned to anyone yet.</p>
                }
              </div>
            </div>
          </section>
        } @empty {
          <div class="card empty">
            <h2>No projects yet</h2>
            <p>Add a project, or ask an Admin to add you to one.</p>
          </div>
        }
      }
  `,
})
export class LeaderPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly placeholders = [0, 1];
  readonly projects = signal<ProjectScoreboard[]>([]);
  readonly loading = signal(true);
  readonly initialsOf = initials;
  readonly toneOf = avatarTone;

  readonly cards = computed<ScoreCard[]>(() =>
    this.projects().map((p) => ({
      project: p,
      donePct: percent(p.ticketCount - p.openTicketCount, p.ticketCount),
      // Only people with work to show: a member with nothing assigned would be an empty 0/0 bar.
      members: p.members
        .filter((m) => m.assigned > 0)
        .map((m) => ({ ...m, pct: percent(m.closed, m.assigned) })),
    })),
  );

  readonly openTotal = computed(() => this.projects().reduce((sum, p) => sum + p.openTicketCount, 0));

  async ngOnInit() {
    try {
      this.projects.set(await this.api.scoreboard());
    } finally {
      this.loading.set(false);
    }
  }
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
