import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, TestCasePatch } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { TestCase, TestCaseStatus, TestSuite, TEST_CATEGORIES, TEST_STATUSES, slug } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';

/** Filters start here, and "All" is what an empty filter means. */
const ALL = 'All';

/**
 * One suite: its screenshots on top, its test cases underneath. Everything a reviewer needs to
 * take a case from "the AI said so" to "this is a ticket" — approve it, mark it passed or failed,
 * or file it — happens in the table, without a dialog per row.
 *
 * Guests and Viewers see the same page with the buttons gone: the API refuses their writes too.
 */
@Component({
  selector: 'app-suite',
  imports: [FormsModule, DatePipe, RouterLink, Topbar, Icon],
  template: `
    <app-topbar />

    <main class="page">
      @if (loading()) {
        <div class="card"><div class="skeleton skeleton-line w-60"></div><div class="skeleton skeleton-line w-80"></div></div>
        <p class="sr-only" role="status">Loading suite…</p>
      } @else if (!suite()) {
        <div class="card empty">
          <h2>Suite not found</h2>
          <p>It may have been deleted, or it belongs to a project you cannot see.</p>
          <a class="btn btn-primary" routerLink="/q/qa">Back to QA Generator</a>
        </div>
      } @else {
        @let s = suite()!;
        <a class="back-link" routerLink="/q/qa" [queryParams]="{ project: s.projectId }">
          <app-icon name="back" /><span>QA Generator</span>
        </a>

        <div class="page-header">
          <div class="suite-head">
            <h1>{{ s.title }}</h1>
            <p class="muted">
              <span class="id-chip">{{ s.projectCode }}</span>
              {{ s.projectName }}
              @if (s.folderName) { <span class="project-note-sep">·</span> {{ s.folderName }} }
              <span class="project-note-sep">·</span> created {{ s.createdAt | date: 'MMM d, y' }}
              @if (s.createdByName) { by {{ s.createdByName }} }
            </p>
            @if (s.businessDescription) {
              <p class="suite-desc prose">{{ s.businessDescription }}</p>
            }
          </div>
        </div>

        <!-- Screenshots first: they are the evidence every case below is supposed to come from. -->
        @if (s.screens.length) {
          <section class="card" aria-labelledby="screens-heading">
            <h2 id="screens-heading" class="section-title">Screenshots ({{ s.screens.length }})</h2>
            <ul class="screen-strip" role="list">
              @for (screen of s.screens; track screen.screenId) {
                <li>
                  <img [src]="screenUrl(screen.attachmentId)"
                    [alt]="'Screenshot ' + ($index + 1) + ' of ' + s.screens.length" loading="lazy" />
                </li>
              }
            </ul>
          </section>
        }

        <div class="toolbar tc-toolbar">
          <div class="state-strip tc-summary" role="group" aria-label="Test case summary">
            <span class="summary-item"><b>{{ summary().total }}</b> total</span>
            <span class="summary-item summary-passed"><b>{{ summary().passed }}</b> passed</span>
            <span class="summary-item summary-failed"><b>{{ summary().failed }}</b> failed</span>
            <span class="summary-item summary-approved"><b>{{ summary().approved }}</b> approved</span>
            <span class="summary-item summary-draft"><b>{{ summary().draft }}</b> draft</span>
          </div>

          <div class="push-left tc-actions">
            <button class="btn btn-ghost" type="button" (click)="toggleImport()" [attr.aria-expanded]="showImport()">
              Import / Manual
            </button>
            @if (canEdit()) {
              <button class="btn btn-primary" type="button" (click)="generate()" [disabled]="busyGenerate() || !s.screens.length">
                @if (busyGenerate()) {
                  <span class="spinner" aria-hidden="true"></span> Generating…
                } @else {
                  Generate with AI
                }
              </button>
            }
          </div>
        </div>

        @if (generateError(); as error) {
          <p class="error-note" role="alert">
            <app-icon name="alert" /> {{ error }}
            <button class="link-btn" type="button" (click)="toggleImport()">Open Import / Manual</button>
          </p>
        }

        @if (showImport()) {
          <section class="card import-panel" aria-labelledby="import-heading">
            <div class="card-head">
              <h2 id="import-heading" class="section-title">Import / Manual</h2>
              <button class="btn btn-ghost btn-sm" type="button" (click)="copyPrompt()" [disabled]="promptLoading()">
                @if (copied()) { Copied } @else { {{ promptLoading() ? 'Loading…' : 'Copy prompt' }} }
              </button>
            </div>
            <p class="muted small">
              Paste this into any chat AI, then bring the JSON reply back below. This is the route that
              works with no AI key configured, and when the quota is used up.
            </p>
            <pre class="prompt-box">{{ prompt() || (promptLoading() ? 'Loading the prompt…' : '') }}</pre>
            <label class="field">
              <span>JSON reply</span>
              <textarea rows="7" class="mono" [(ngModel)]="importText"
                placeholder='{"testCases":[{"title":"…","category":"Functional","priority":2,"preconditions":"","steps":["…"],"expected":"…"}]}'></textarea>
            </label>
            <div class="import-actions">
              <button class="btn btn-primary" type="button" (click)="importCases()" [disabled]="busyImport() || !importText.trim()">
                {{ busyImport() ? 'Importing…' : 'Import cases' }}
              </button>
              <span class="hint">Everything imported arrives as Draft with source “Imported”.</span>
            </div>
          </section>
        }

        <section class="card" aria-labelledby="cases-heading">
          <div class="card-head">
            <h2 id="cases-heading" class="section-title">Test cases ({{ s.cases.length }})</h2>
          </div>

          <div class="toolbar">
            <div class="state-strip" role="group" aria-label="Filter by status">
              @for (status of statusesWithAll; track status) {
                <button type="button" class="state-chip" [class.active]="statusFilter() === status"
                  [attr.aria-pressed]="statusFilter() === status" (click)="statusFilter.set(status)">
                  {{ status }} <span class="state-chip-count">{{ countByStatus(status) }}</span>
                </button>
              }
            </div>
            <label class="sr-only" for="tcCategory">Category</label>
            <select id="tcCategory" class="filter-select" [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)">
              <option [value]="ALL">All categories</option>
              @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
            </select>
            <label class="sr-only" for="tcPriority">Priority</label>
            <select id="tcPriority" class="filter-select" [ngModel]="priorityFilter()" (ngModelChange)="priorityFilter.set($event)">
              <option [value]="ALL">All priorities</option>
              <option [value]="1">Priority 1</option>
              <option [value]="2">Priority 2</option>
              <option [value]="3">Priority 3</option>
              <option [value]="4">Priority 4</option>
            </select>
          </div>

          @if (visible().length === 0) {
            <div class="empty">
              @if (s.cases.length === 0) {
                <h3>No test cases yet</h3>
                @if (canEdit()) {
                  <p>Generate them from the screenshots, or paste a reply from any chat AI.</p>
                } @else {
                  <p>Nobody has added cases to this suite yet.</p>
                }
              } @else {
                <h3>Nothing matches these filters</h3>
                <p><button class="link-btn" type="button" (click)="clearFilters()">Clear the filters</button></p>
              }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table table-hover tc-table">
                <thead>
                  <tr>
                    <th class="w-id">Key</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th class="col-priority">Priority</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Ticket</th>
                    <th class="w-actions"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of visible(); track c.testCaseId) {
                    <tr [class.row-expanded]="expandedId() === c.testCaseId">
                      <td>
                        <button type="button" class="icon-btn tc-expand" (click)="toggleDetail(c)"
                          [class.rotated]="expandedId() === c.testCaseId"
                          [attr.aria-expanded]="expandedId() === c.testCaseId"
                          [attr.aria-label]="'Details for ' + c.caseKey">
                          <app-icon name="caret" />
                        </button>
                        <span class="id-chip">{{ c.caseKey }}</span>
                      </td>
                      <td class="title-cell">
                        @if (editingId() === c.testCaseId) {
                          <input class="title-input" #titleInput [ngModel]="titleDraft"
                            (ngModelChange)="titleDraft = $event" (keydown.enter)="saveTitle(c)"
                            (keydown.escape)="editingId.set(null)" [attr.aria-label]="'Title of ' + c.caseKey" />
                        } @else {
                          <button type="button" class="link-btn tc-title" (click)="startTitle(c)">{{ c.title }}</button>
                        }
                      </td>
                      <td>
                        <select class="chip-select tc-cat tc-cat-{{ slug(c.category) }}" [attr.aria-label]="'Category of ' + c.caseKey"
                          [ngModel]="c.category" [disabled]="!canEdit()" (ngModelChange)="setCategory(c, $event)">
                          @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
                        </select>
                      </td>
                      <td class="col-priority">
                        <select class="chip-select tc-prio" [attr.aria-label]="'Priority of ' + c.caseKey"
                          [ngModel]="c.priority" [disabled]="!canEdit()" (ngModelChange)="setPriority(c, $event)">
                          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
                        </select>
                      </td>
                      <td>
                        <select class="chip-select tc-state tc-state-{{ slug(c.status) }}" [attr.aria-label]="'Status of ' + c.caseKey"
                          [ngModel]="c.status" [disabled]="!canEdit()" (ngModelChange)="setStatus(c, $event)">
                          @for (status of statuses; track status) { <option [value]="status">{{ status }}</option> }
                        </select>
                      </td>
                      <td><span class="tc-source" [class.tc-source-ai]="c.source === 'Ai'">{{ sourceLabel(c) }}</span></td>
                      <td>
                        @if (c.linkedTicketId && c.linkedTicketKey) {
                          <a [routerLink]="['/projects', s.projectId]" [queryParams]="{ ticket: c.linkedTicketId }">{{ c.linkedTicketKey }}</a>
                        } @else if (canEdit()) {
                          <button type="button" class="btn btn-sm btn-ghost" (click)="createTicket(c)"
                            [disabled]="c.status !== 'Failed' || busyRow() === c.testCaseId"
                            [title]="c.status === 'Failed' ? 'Create a Bug from this case' : 'Only a Failed case can become a ticket'">
                            {{ busyRow() === c.testCaseId ? 'Creating…' : 'Create ticket' }}
                          </button>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="w-actions">
                        @if (canEdit()) {
                          @if (c.status === 'Draft') {
                            <button type="button" class="btn btn-sm btn-ghost" (click)="setStatus(c, 'Approved')"
                              [disabled]="busyRow() === c.testCaseId">Approve</button>
                          }
                          <button type="button" class="btn btn-sm btn-ghost danger" (click)="askDelete(c)">Delete</button>
                        }
                      </td>
                    </tr>

                    @if (expandedId() === c.testCaseId) {
                      <tr class="tc-detail">
                        <td colspan="8">
                          @if (detailDraft(); as d) {
                            <div class="tc-detail-grid">
                              <label class="field span-2">
                                <span>Preconditions</span>
                                <textarea rows="2" [(ngModel)]="d.preconditions" [disabled]="!canEdit()"></textarea>
                              </label>
                              <label class="field span-2">
                                <span>Steps (one per line)</span>
                                <textarea rows="6" class="mono" [(ngModel)]="d.steps" [disabled]="!canEdit()"></textarea>
                              </label>
                              <label class="field span-2">
                                <span>Expected result</span>
                                <textarea rows="3" [(ngModel)]="d.expected" [disabled]="!canEdit()"></textarea>
                              </label>
                            </div>
                            @if (canEdit()) {
                              <div class="tc-detail-actions">
                                <button type="button" class="btn btn-primary btn-sm" (click)="saveDetail(c)"
                                  [disabled]="busyRow() === c.testCaseId">Save</button>
                                <button type="button" class="btn btn-ghost btn-sm" (click)="closeDetail()">Cancel</button>
                              </div>
                            }
                          } @else {
                            <p class="muted small">Loading…</p>
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </main>
  `,
})
export class SuitePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly ALL = ALL;
  readonly statuses = TEST_STATUSES;
  readonly statusesWithAll: (typeof ALL | TestCaseStatus)[] = [ALL, ...TEST_STATUSES];
  readonly categories = TEST_CATEGORIES;
  readonly priorities = [1, 2, 3, 4];
  readonly slug = slug;

  readonly suite = signal<TestSuite | null>(null);
  readonly loading = signal(true);
  readonly busyGenerate = signal(false);
  readonly generateError = signal<string | null>(null);
  readonly busyRow = signal<number | null>(null);

  readonly showImport = signal(false);
  readonly prompt = signal('');
  readonly promptLoading = signal(false);
  readonly copied = signal(false);
  readonly busyImport = signal(false);
  importText = '';

  readonly statusFilter = signal<typeof ALL | TestCaseStatus>(ALL);
  readonly categoryFilter = signal<string>(ALL);
  readonly priorityFilter = signal<string>(ALL);

  readonly editingId = signal<number | null>(null);
  titleDraft = '';
  readonly expandedId = signal<number | null>(null);
  readonly detailDraft = signal<{ preconditions: string; steps: string; expected: string } | null>(null);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  /** Read access is enough to look; everything that writes needs more than "Viewer". */
  readonly canEdit = computed(() => {
    const role = this.suite()?.myRole;
    return !!role && role !== 'Viewer';
  });

  readonly summary = computed(() => {
    const cases = this.suite()?.cases ?? [];
    const count = (status: TestCaseStatus) => cases.filter((c) => c.status === status).length;
    return {
      total: cases.length,
      passed: count('Passed'),
      failed: count('Failed'),
      approved: count('Approved'),
      draft: count('Draft'),
    };
  });

  readonly visible = computed(() => {
    const status = this.statusFilter();
    const category = this.categoryFilter();
    const priority = this.priorityFilter();
    return (this.suite()?.cases ?? []).filter(
      (c) =>
        (status === ALL || c.status === status) &&
        (category === ALL || c.category === category) &&
        (priority === ALL || c.priority === Number(priority)),
    );
  });

  constructor() {
    // Opening the title editor puts the caret in it, so typing starts the rename.
    effect(() => {
      if (this.editingId() == null) return;
      const el = this.titleInput()?.nativeElement;
      if (el) setTimeout(() => { el.focus(); el.select(); });
    });
  }

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('suiteId'));
    try {
      this.suite.set(await this.api.testSuite(id));
    } catch {
      this.suite.set(null); // the interceptor has already said why
    } finally {
      this.loading.set(false);
    }
  }

  /** An <img> cannot send an Authorization header, so the token rides in the query string. */
  screenUrl(attachmentId: number) {
    return this.api.attachmentUrl(attachmentId, this.auth.getToken());
  }

  countByStatus(status: typeof ALL | TestCaseStatus) {
    if (status === ALL) return this.suite()?.cases.length ?? 0;
    return this.suite()?.cases.filter((c) => c.status === status).length ?? 0;
  }

  clearFilters() {
    this.statusFilter.set(ALL);
    this.categoryFilter.set(ALL);
    this.priorityFilter.set(ALL);
  }

  sourceLabel(c: TestCase) {
    return c.source === 'Ai' ? 'AI' : c.source === 'Imported' ? 'Imported' : 'Manual';
  }

  // ---------- Generation and import ----------

  async generate() {
    const suite = this.suite();
    if (!suite || this.busyGenerate()) return;
    this.busyGenerate.set(true);
    this.generateError.set(null);
    try {
      const added = await this.api.generateTestCases(suite.suiteId);
      this.suite.update((s) => (s ? { ...s, cases: [...s.cases, ...added] } : s));
      this.toast.success(`Added ${added.length} test ${added.length === 1 ? 'case' : 'cases'} as Draft.`);
    } catch (err) {
      // Shown next to the button, in the provider's own words: a spent quota is not a crash.
      this.generateError.set(this.message(err));
    } finally {
      this.busyGenerate.set(false);
    }
  }

  async toggleImport() {
    this.showImport.update((open) => !open);
    if (!this.showImport() || this.prompt() || this.promptLoading()) return;
    const suite = this.suite();
    if (!suite) return;

    this.promptLoading.set(true);
    try {
      this.prompt.set((await this.api.testSuitePrompt(suite.suiteId)).prompt);
    } catch {
      // The interceptor has already said why; the box stays where it is.
    } finally {
      this.promptLoading.set(false);
    }
  }

  async copyPrompt() {
    if (!this.prompt()) return;
    try {
      await navigator.clipboard.writeText(this.prompt());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.toast.error('Could not copy automatically — select the text and copy it yourself.');
    }
  }

  async importCases() {
    const suite = this.suite();
    if (!suite || this.busyImport()) return;
    this.busyImport.set(true);
    try {
      const added = await this.api.importTestCases(suite.suiteId, this.importText.trim());
      this.suite.update((s) => (s ? { ...s, cases: [...s.cases, ...added] } : s));
      this.importText = '';
      this.toast.success(`Imported ${added.length} test ${added.length === 1 ? 'case' : 'cases'} as Draft.`);
    } catch (err) {
      // A reply nothing could be read from saves nothing, and says so here.
      this.toast.error(this.message(err));
    } finally {
      this.busyImport.set(false);
    }
  }

  // ---------- Editing rows ----------

  startTitle(c: TestCase) {
    if (!this.canEdit()) return;
    this.editingId.set(c.testCaseId);
    this.titleDraft = c.title;
  }

  async saveTitle(c: TestCase) {
    const title = this.titleDraft.trim();
    this.editingId.set(null);
    if (!title || title === c.title) return;
    await this.saveCase(c, { title });
  }

  async setCategory(c: TestCase, category: string) {
    if (category === c.category) return;
    await this.saveCase(c, { category });
  }

  async setPriority(c: TestCase, priority: string) {
    const value = Number(priority);
    if (value === c.priority) return;
    await this.saveCase(c, { priority: value });
  }

  async setStatus(c: TestCase, status: string) {
    if (status === c.status) return;
    this.busyRow.set(c.testCaseId);
    const ok = await this.saveCase(c, { status });
    this.busyRow.set(null);
    if (ok) this.toast.success(`${c.caseKey} is now ${status}.`);
  }

  toggleDetail(c: TestCase) {
    if (this.expandedId() === c.testCaseId) return this.closeDetail();
    this.expandedId.set(c.testCaseId);
    this.detailDraft.set({
      preconditions: c.preconditions,
      steps: c.steps.join('\n'),
      expected: c.expected,
    });
  }

  closeDetail() {
    this.expandedId.set(null);
    this.detailDraft.set(null);
  }

  async saveDetail(c: TestCase) {
    const draft = this.detailDraft();
    if (!draft) return;
    this.busyRow.set(c.testCaseId);
    const ok = await this.saveCase(c, {
      preconditions: draft.preconditions,
      steps: draft.steps.split('\n').map((s) => s.trim()).filter(Boolean),
      expected: draft.expected,
    });
    this.busyRow.set(null);
    if (ok) {
      this.closeDetail();
      this.toast.success(`${c.caseKey} saved.`);
    }
  }

  async askDelete(c: TestCase) {
    if (!(await this.confirm.ask({
      title: `Delete ${c.caseKey}?`,
      message: `This removes “${c.title}” from the suite. A ticket already created from it stays.`,
      confirmLabel: 'Delete test case',
      tone: 'danger',
    }))) return;

    this.busyRow.set(c.testCaseId);
    try {
      await this.api.deleteTestCase(c.testCaseId);
      this.suite.update((s) => (s ? { ...s, cases: s.cases.filter((x) => x.testCaseId !== c.testCaseId) } : s));
      if (this.expandedId() === c.testCaseId) this.closeDetail();
    } catch (err) {
      this.toast.error(this.message(err));
    } finally {
      this.busyRow.set(null);
    }
  }

  async createTicket(c: TestCase) {
    if (c.linkedTicketId) return;
    this.busyRow.set(c.testCaseId);
    try {
      const { id, ticketKey } = await this.api.createTicketFromTestCase(c.testCaseId);
      this.patch(c, { linkedTicketId: id, linkedTicketKey: ticketKey });
      this.toast.success(`${c.caseKey} is now ticket ${ticketKey}.`);
    } catch (err) {
      this.toast.error(this.message(err));
    } finally {
      this.busyRow.set(null);
    }
  }

  /** Saves one case and keeps the row in step, so the table never lies about what the API holds. */
  private async saveCase(c: TestCase, patch: TestCasePatch): Promise<boolean> {
    try {
      await this.api.updateTestCase(c.testCaseId, patch);
      this.patch(c, patch);
      return true;
    } catch (err) {
      this.toast.error(this.message(err));
      return false;
    }
  }

  private patch(c: TestCase, changes: object) {
    const clean = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    this.suite.update((s) =>
      s ? { ...s, cases: s.cases.map((x) => (x.testCaseId === c.testCaseId ? { ...x, ...clean } : x)) } : s,
    );
  }

  /** The same words the error interceptor shows, kept for the box under the Generate button. */
  private message(err: unknown): string {
    const body = (err as HttpErrorResponse | undefined)?.error;
    return body?.detail || body?.title || body?.message || 'Something went wrong. Try again.';
  }
}
