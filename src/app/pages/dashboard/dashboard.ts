import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LeaderPage } from '../leader/leader';
import { UsersDashboardPage } from '../users-dashboard/users-dashboard';
import { ProjectCreate } from '../../shared/project-create';
import { Topbar } from '../../shared/topbar';
import { Icon } from '../../shared/icon';

/**
 * One Dashboard for Admins and Leaders, holding what were two pages: the Leader Dashboard
 * (project rings + per-member progress) and the Users Dashboard (everyone's load against
 * their limit). The legacy /leader and /users-dashboard URLs open this page on the matching
 * tab, read from route data, so old links keep their meaning.
 */
@Component({
  selector: 'app-dashboard',
  imports: [Topbar, Icon, ProjectCreate, LeaderPage, UsersDashboardPage],
  template: `
    <app-topbar crumb="Dashboard">
      <button class="btn btn-primary" (click)="adding.set(true)"><app-icon name="plus" /> Add project</button>
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p class="muted">Project progress and everyone's workload, in one place.</p>
        </div>
      </div>

      <div class="tabs" role="tablist" aria-label="Dashboard views">
        <button role="tab" id="dash-tab-leader" [attr.aria-selected]="tab() === 'leader'"
          [attr.aria-controls]="'dash-panel-leader'" [class.active]="tab() === 'leader'"
          (click)="tab.set('leader')">
          <app-icon name="chart" /> Leader Dashboard
        </button>
        <button role="tab" id="dash-tab-workload" [attr.aria-selected]="tab() === 'workload'"
          [attr.aria-controls]="'dash-panel-workload'" [class.active]="tab() === 'workload'"
          (click)="tab.set('workload')">
          <app-icon name="users" /> Users Dashboard
        </button>
      </div>

      @if (tab() === 'leader') {
        <div id="dash-panel-leader" role="tabpanel" aria-labelledby="dash-tab-leader">
          <app-leader />
        </div>
      } @else {
        <div id="dash-panel-workload" role="tabpanel" aria-labelledby="dash-tab-workload">
          <app-users-dashboard />
        </div>
      }
    </main>

    @if (adding()) {
      <app-project-create (closed)="adding.set(false)" />
    }
  `,
})
export class DashboardPage {
  private readonly route = inject(ActivatedRoute);

  readonly tab = signal<'leader' | 'workload'>(
    this.route.snapshot.data['tab'] === 'workload' ? 'workload' : 'leader',
  );
  readonly adding = signal(false);
}
