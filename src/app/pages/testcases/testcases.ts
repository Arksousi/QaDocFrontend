import { DatePipe } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { Project, TestSuite } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';
import { NewSuite } from './new-suite';

/**
 * The Test Case Generator's home: pick a project (the same list the Projects page holds), then
 * open one of its suites. The choice lives in the URL, so a suite list can be shared like a
 * ticket link; guests see it too, read-only, for the demo projects.
 */
@Component({
  selector: 'app-test-cases',
  imports: [FormsModule, DatePipe, RouterLink, Topbar, NewSuite, Icon],
  template: `
    <app-topbar>
      @if (canCreate()) {
        <button class="btn btn-primary" (click)="adding.set(true)"><app-icon name="plus" /> New suite</button>
      }
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>QA Generator</h1>
          <p class="muted">Screenshots in, test cases out — reviewed, approved, run, and filed as Q Desk tickets.</p>
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
        <p class="sr-only" role="status">Loading test suites…</p>
      } @else if (projects().length === 0) {
        <div class="card empty">
          <h2>No projects yet</h2>
          <p>A suite belongs to a project, so there is nothing to generate for until one exists.</p>
          <a class="btn btn-primary" routerLink="/">Go to Q Desk</a>
        </div>
      } @else {
        <div class="toolbar">
          <label class="sr-only" for="tcProject">Project</label>
          <select id="tcProject" [ngModel]="projectId()" (ngModelChange)="pickProject($event)">
            @for (p of projects(); track p.projectId) {
              <option [ngValue]="p.projectId">{{ p.projectName }} ({{ p.projectCode }})</option>
            }
          </select>
          @if (project(); as p) {
            <span class="muted small">Your role here: {{ p.myRole ?? 'no access' }}</span>
          }
        </div>

        @if (suitesLoading()) {
          <div class="card"><div class="skeleton skeleton-line w-80"></div></div>
        } @else if (suites().length === 0) {
          <div class="card empty">
            <h2>No test suites yet</h2>
            @if (canCreate()) {
              <p>Add a suite with the screenshots of the screens you want tested.</p>
              <button class="btn btn-primary" (click)="adding.set(true)"><app-icon name="plus" /> New suite</button>
            } @else {
              <p>Once someone adds a suite to this project, it will show up here.</p>
            }
          </div>
        } @else {
          <section class="recent-grid" aria-label="Test suites">
            @for (s of suites(); track s.suiteId) {
              <div class="recent-item">
                <a class="card recent-card" [routerLink]="['/q/qa', s.suiteId]">
                  <span class="id-chip">{{ s.projectCode }}</span>
                  <h3>{{ s.title }}</h3>
                  <p class="muted small">{{ s.screenCount }} {{ s.screenCount === 1 ? 'screenshot' : 'screenshots' }} · {{ s.caseCount }} {{ s.caseCount === 1 ? 'case' : 'cases' }}</p>
                  <p class="muted small">Created {{ s.createdAt | date: 'MMM d, y' }}@if (s.createdByName) { by {{ s.createdByName }} }</p>
                </a>
                @if (canCreate()) {
                  <div class="row-menu">
                    <button class="icon-btn" (click)="toggleMenu(s)"
                      [attr.aria-expanded]="menuKey() === s.suiteId" aria-haspopup="menu"
                      [attr.aria-label]="'Actions for ' + s.title"><app-icon name="more" /></button>
                    @if (menuKey() === s.suiteId) {
                      <div class="menu" role="menu">
                        <button role="menuitem" class="danger" (click)="askDelete(s)">Delete suite…</button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }
      }
    </main>

    @if (adding() && project(); as p) {
      <app-new-suite [projectId]="p.projectId" [projectName]="p.projectName"
        (closed)="adding.set(false)" (created)="openSuite($event)" />
    }
  `,
})
export class TestCasesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /** Rows the skeleton draws while loading. */
  readonly placeholders = [0, 1, 2, 3];

  readonly projects = signal<Project[]>([]);
  readonly projectId = signal<number | null>(null);
  readonly suites = signal<TestSuite[]>([]);
  readonly loading = signal(true);
  readonly suitesLoading = signal(false);
  readonly adding = signal(false);
  /** Which ⋯ menu is open, or null. */
  readonly menuKey = signal<number | null>(null);

  readonly project = computed(() => this.projects().find((p) => p.projectId === this.projectId()) ?? null);
  /** Creating and deleting need more than read access; the API refuses the rest either way. */
  readonly canCreate = computed(() => {
    const role = this.project()?.myRole;
    return !!role && role !== 'Viewer';
  });

  async ngOnInit() {
    try {
      const projects = await this.api.projects();
      this.projects.set(projects);
      // ?project= keeps a suite list shareable; otherwise the first project opens.
      const wanted = Number(this.route.snapshot.queryParamMap.get('project'));
      this.projectId.set(projects.some((p) => p.projectId === wanted) ? wanted : projects[0]?.projectId ?? null);
      if (this.projectId() != null) await this.loadSuites();
    } finally {
      this.loading.set(false);
    }
  }

  async pickProject(projectId: number) {
    this.projectId.set(projectId);
    await this.loadSuites();
    this.router.navigate([], { queryParams: { project: projectId }, replaceUrl: true });
  }

  async loadSuites() {
    const projectId = this.projectId();
    if (projectId == null) return;
    this.suitesLoading.set(true);
    try {
      this.suites.set(await this.api.testSuites(projectId));
    } finally {
      this.suitesLoading.set(false);
    }
  }

  openSuite(suiteId: number) {
    this.router.navigate(['/q/qa', suiteId]);
  }

  toggleMenu(suite: TestSuite) {
    this.menuKey.set(this.menuKey() === suite.suiteId ? null : suite.suiteId);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.menuKey() && !(event.target as HTMLElement).closest?.('.row-menu')) this.menuKey.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuKey.set(null);
  }

  async askDelete(suite: TestSuite) {
    this.menuKey.set(null);
    if (!(await this.confirm.ask({
      title: 'Delete this suite?',
      message: `This permanently deletes “${suite.title}” with its ${suite.caseCount} test case${suite.caseCount === 1 ? '' : 's'} and screenshots. Tickets already created from it stay.`,
      confirmLabel: 'Delete suite',
      tone: 'danger',
    }))) return;

    try {
      await this.api.deleteTestSuite(suite.suiteId);
      this.toast.success(`Suite “${suite.title}” deleted.`);
      await this.loadSuites();
    } catch {
      // The error interceptor has already said why.
    }
  }
}
