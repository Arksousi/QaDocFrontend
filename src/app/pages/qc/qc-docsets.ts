import { DatePipe } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { Project, QcDocSet, canEditTickets } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';
import { NewDocSetModal } from './new-docset';

/**
 * QC Generator: lists docsets for the selected project.
 */
@Component({
  selector: 'app-qc-docsets',
  imports: [FormsModule, DatePipe, RouterLink, Topbar, NewDocSetModal, Icon],
  template: `
    <app-topbar>
      @if (canCreate()) {
        <button class="btn btn-primary" (click)="adding.set(true)"><app-icon name="plus" /> New doc set</button>
      }
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>QC Generator</h1>
          <p class="muted">Upload sequenced screenshots and logo to produce product documentation and task-oriented user manuals.</p>
        </div>
      </div>

      @if (loading()) {
        <section aria-hidden="true">
          <div class="card">
            @for (i of placeholders; track i) { <div class="skeleton skeleton-line w-60"></div> }
          </div>
          <div class="recent-grid">
            @for (i of placeholders; track i) { <div class="skeleton skeleton-card"></div> }
          </div>
        </section>
        <p class="sr-only" role="status">Loading documentation sets…</p>
      } @else if (projects().length === 0) {
        <div class="card empty">
          <h2>No projects yet</h2>
          <p>A documentation set belongs to a project, so there is nothing to generate for until one exists.</p>
          <a class="btn btn-primary" routerLink="/">Go to Q Desk</a>
        </div>
      } @else {
        <div class="toolbar">
          <label class="sr-only" for="qcProject">Project</label>
          <select id="qcProject" [ngModel]="projectId()" (ngModelChange)="pickProject($event)">
            @for (p of projects(); track p.projectId) {
              <option [ngValue]="p.projectId">{{ p.projectName }} ({{ p.projectCode }})</option>
            }
          </select>
          @if (project(); as p) {
            <span class="muted small">Your role here: {{ p.myRole ?? 'no access' }}</span>
          }
        </div>

        @if (docSetsLoading()) {
          <div class="card"><div class="skeleton skeleton-line w-80"></div></div>
        } @else if (docSets().length === 0) {
          <div class="card empty">
            <h2>No documentation sets yet</h2>
            @if (canCreate()) {
              <p>Add a doc set with the ordered screenshots of your application.</p>
              <button class="btn btn-primary" (click)="adding.set(true)"><app-icon name="plus" /> New doc set</button>
            } @else {
              <p>Once someone adds a documentation set to this project, it will show up here.</p>
            }
          </div>
        } @else {
          <section class="recent-grid" aria-label="Documentation sets">
            @for (ds of docSets(); track ds.docSetId) {
              <div class="recent-item">
                <a class="card recent-card qc-card" [routerLink]="['/q/qc', ds.docSetId]">
                  <div class="card-head">
                    <span class="id-chip">{{ ds.projectCode }}</span>
                    <span class="chip chip-soft">{{ ds.appName }}</span>
                    <span class="chip-lang uppercase">{{ ds.language }}</span>
                  </div>
                  <h3>{{ ds.title }}</h3>
                  <p class="muted small">
                    {{ ds.screenCount }} {{ ds.screenCount === 1 ? 'screenshot' : 'screenshots' }} ·
                    {{ ds.documentCount }} {{ ds.documentCount === 1 ? 'document' : 'documents' }}
                  </p>
                  <p class="muted small">Created {{ ds.createdAt | date: 'MMM d, y' }}@if (ds.createdByName) { by {{ ds.createdByName }} }</p>
                </a>
                @if (canCreate()) {
                  <div class="row-menu">
                    <button class="icon-btn" (click)="toggleMenu(ds)"
                      [attr.aria-expanded]="menuKey() === ds.docSetId" aria-haspopup="menu"
                      [attr.aria-label]="'Actions for ' + ds.title"><app-icon name="more" /></button>
                    @if (menuKey() === ds.docSetId) {
                      <div class="menu" role="menu">
                        <button role="menuitem" class="danger" (click)="askDelete(ds)">Delete doc set…</button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }
      }

      @if (adding() && project(); as p) {
        <app-new-docset
          [projectId]="p.projectId"
          [projectName]="p.projectName"
          (closed)="adding.set(false)"
          (created)="onCreated($event)" />
      }
    </main>
  `,
})
export class QcDocSetsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly placeholders = [1, 2, 3];
  readonly loading = signal(true);
  readonly projects = signal<Project[]>([]);
  readonly projectId = signal<number | null>(null);
  readonly project = computed(() => this.projects().find((p) => p.projectId === this.projectId()) ?? null);

  readonly docSets = signal<QcDocSet[]>([]);
  readonly docSetsLoading = signal(false);
  readonly adding = signal(false);
  readonly menuKey = signal<number | null>(null);

  readonly canCreate = computed(() => {
    if (this.auth.isGuest()) return false;
    return canEditTickets(this.project()?.myRole);
  });

  async ngOnInit() {
    try {
      const list = await this.api.projects();
      this.projects.set(list);

      const wanted = Number(this.route.snapshot.queryParamMap.get('project'));
      const initial = list.find((p) => p.projectId === wanted) ?? list[0] ?? null;
      if (initial) await this.pickProject(initial.projectId);
    } finally {
      this.loading.set(false);
    }
  }

  async pickProject(id: number) {
    this.projectId.set(id);
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: id }, queryParamsHandling: 'merge' });
    this.docSetsLoading.set(true);
    try {
      this.docSets.set(await this.api.qcDocSets(id));
    } finally {
      this.docSetsLoading.set(false);
    }
  }

  toggleMenu(ds: QcDocSet) {
    this.menuKey.set(this.menuKey() === ds.docSetId ? null : ds.docSetId);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.menuKey() && !(event.target as HTMLElement).closest?.('.row-menu')) this.menuKey.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuKey.set(null);
  }

  async askDelete(ds: QcDocSet) {
    this.menuKey.set(null);
    if (!(await this.confirm.ask({
      title: `Delete "${ds.title}"?`,
      message: 'This will remove the docset, all its screens, and all generated document versions permanently.',
      confirmLabel: 'Delete doc set',
      tone: 'danger',
    }))) return;

    try {
      await this.api.deleteQcDocSet(ds.docSetId);
      this.docSets.update((list) => list.filter((s) => s.docSetId !== ds.docSetId));
      this.toast.success('Documentation set deleted.');
    } catch {
      this.toast.error('Could not delete doc set.');
    }
  }

  onCreated(newDocSetId: number) {
    this.adding.set(false);
    this.router.navigate(['/q/qc', newDocSetId]);
  }
}
