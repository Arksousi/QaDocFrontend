import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Project } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Topbar } from '../../shared/topbar';

@Component({
  selector: 'app-project-menu',
  imports: [FormsModule, RouterLink, DatePipe, Modal, Topbar],
  template: `
    <app-topbar>
      <button class="btn btn-primary" (click)="openAdd()">+ Add project</button>
    </app-topbar>

    <main class="page">
      <h1>Projects</h1>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (projects().length === 0) {
        <div class="card empty">
          <h2>No projects yet</h2>
          <p>Add a project to start tracking tickets.</p>
        </div>
      } @else {
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" class="section-title">Recent projects</h2>
          <div class="recent-grid">
            @for (p of recent(); track p.projectId) {
              <a class="card recent-card" [routerLink]="['/projects', p.projectId]">
                <h3>{{ p.projectName }}</h3>
                <p class="muted small">{{ p.openTicketCount }} open · {{ p.ticketCount }} total</p>
                <p class="muted small">Last activity {{ p.lastActivity | date: 'MMM d, y, h:mm a' }}</p>
                @if (p.createdByName) { <p class="muted small">Created by {{ p.createdByName }}</p> }
              </a>
            }
          </div>
        </section>

        <section class="card" aria-labelledby="all-heading">
          <div class="card-head">
            <h2 id="all-heading" class="section-title">All projects</h2>
            <input class="search" type="search" placeholder="Search by name…" aria-label="Search projects"
              [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </div>
          <div class="table-wrap">
            <table class="table table-hover">
              <thead>
                <tr><th>Name</th><th>Created by</th><th class="num">Open tickets</th><th class="num">Total tickets</th><th>Last activity</th></tr>
              </thead>
              <tbody>
                @for (p of filtered(); track p.projectId) {
                  <tr class="clickable" (click)="open(p)">
                    <td><a [routerLink]="['/projects', p.projectId]" (click)="$event.stopPropagation()">{{ p.projectName }}</a></td>
                    <td>
                      @if (p.createdByName) { {{ p.createdByName }} } @else { <span class="muted">—</span> }
                    </td>
                    <td class="num">{{ p.openTicketCount }}</td>
                    <td class="num">{{ p.ticketCount }}</td>
                    <td class="muted nowrap">{{ p.lastActivity | date: 'MMM d, y, h:mm a' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="muted center">No projects match “{{ search() }}”.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </main>

    @if (adding()) {
      <app-modal heading="Add project" (closed)="adding.set(false)">
        <form id="addProjectForm" class="form" (ngSubmit)="save()">
          <label>Name *
            <input name="name" [(ngModel)]="newName" required maxlength="150" autofocus placeholder="e.g. Web Shop" />
          </label>
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="adding.set(false)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="addProjectForm" [disabled]="saving() || !newName.trim()">Add project</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class ProjectMenuPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly projects = signal<Project[]>([]);
  readonly recent = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');
  newName = '';

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.projects();
    return this.projects().filter((p) => p.projectName.toLowerCase().includes(q));
  });

  async ngOnInit() {
    try {
      const [all, recent] = await Promise.all([this.api.projects(), this.api.recentProjects(5)]);
      this.projects.set(all);
      this.recent.set(recent);
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.newName = '';
    this.adding.set(true);
  }

  async save() {
    const name = this.newName.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      const { id } = await this.api.createProject(name);
      this.toast.success(`Project “${name}” created.`);
      this.router.navigate(['/projects', id]);
    } finally {
      this.saving.set(false);
    }
  }

  open(p: Project) {
    this.router.navigate(['/projects', p.projectId]);
  }
}
