import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { MAX_QC_DOCSET_IMAGES, QcDocScreen, QcDocSet, QcDocument, QcJobStatus, canEditTickets } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { extractImageFiles, isTextPasteInInput, normalizePastedFiles } from '../../shared/clipboard';
import { Icon } from '../../shared/icon';
import { shrink } from '../../shared/rich-text';
import { Topbar } from '../../shared/topbar';

type Tab = 'screens' | 'documentation' | 'manual';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-qc-docset-detail',
  imports: [FormsModule, DatePipe, NgTemplateOutlet, RouterLink, Topbar, Icon],
  template: `
    <app-topbar />

    <main class="page">
      @if (loading()) {
        <div class="card"><div class="skeleton skeleton-line w-60"></div></div>
      } @else if (!docSet()) {
        <div class="card empty">
          <h2>Documentation set not found</h2>
          <p>It may have been deleted, or it belongs to a project you cannot see.</p>
          <a class="btn btn-primary" routerLink="/q/qc">Back to QC Generator</a>
        </div>
      } @else {
        @let ds = docSet()!;
        <div class="breadcrumb">
          <a class="back-link" routerLink="/q/qc" [queryParams]="{ project: ds.projectId }">
            <app-icon name="back" /><span>QC Generator</span>
          </a>
          <span class="sep">/</span>
          <span>{{ ds.projectName }}</span>
        </div>

        <div class="docset-header card">
          <div class="docset-header-main">
            @if (ds.logoAttachmentId) {
              <img [src]="'/api/attachments/' + ds.logoAttachmentId + '?access_token=' + token()" alt="App Logo" class="docset-logo" />
            }
            <div class="docset-title-box">
              <div class="docset-chips">
                <span class="id-chip">{{ ds.projectCode }}</span>
                <span class="chip chip-soft">{{ ds.appName }}</span>
                <span class="chip-lang uppercase">{{ ds.language }}</span>
                @if (ds.isDemo) { <span class="chip chip-neutral">Demo</span> }
              </div>
              <h1>{{ ds.title }}</h1>
              @if (ds.businessDescription) {
                <p class="docset-desc">{{ ds.businessDescription }}</p>
              }
              <p class="muted small">Created {{ ds.createdAt | date: 'mediumDate' }}@if (ds.createdByName) { by {{ ds.createdByName }} }</p>
            </div>
          </div>

          <!-- Tab Navigation -->
          <nav class="docset-tabs" aria-label="Docset Sections">
            <button type="button" class="tab-link" [class.active]="activeTab() === 'screens'" (click)="activeTab.set('screens')">
              Screens ({{ ds.screens.length }})
            </button>
            <button type="button" class="tab-link" [class.active]="activeTab() === 'documentation'" (click)="activeTab.set('documentation')">
              Product Documentation ({{ docsForKind('Documentation').length }})
            </button>
            <button type="button" class="tab-link" [class.active]="activeTab() === 'manual'" (click)="activeTab.set('manual')">
              User Manual ({{ docsForKind('UserManual').length }})
            </button>
          </nav>
        </div>

        <!-- TAB 1: SCREENS -->
        @if (activeTab() === 'screens') {
          <div class="screens-tab-content" [class.dragging]="draggingScreens()"
            (dragover)="onDragOverScreens($event)"
            (dragleave)="draggingScreens.set(false)"
            (drop)="onDropScreens($event)">
            <input #screenPicker type="file" accept="image/png,image/jpeg,image/webp" multiple hidden (change)="onAddScreens(screenPicker)" />
            <div class="tab-toolbar">
              <h2>Screenshots ({{ ds.screens.length }}/{{ maxImages }})</h2>
              @if (canEdit()) {
                <div class="toolbar-actions">
                  <button type="button" class="btn btn-sm btn-primary" (click)="screenPicker.click()" title="Add screenshots or paste (Ctrl+V)">
                    <app-icon name="plus" /> Add screenshots
                  </button>
                </div>
              }
            </div>

            @if (ds.screens.length === 0) {
              <div class="card empty">
                <h3>No screenshots uploaded</h3>
                <p>Upload screenshots of your application in sequence so the AI can analyze workflows. Drag screenshots here, or paste with Ctrl+V.</p>
                @if (canEdit()) {
                  <button type="button" class="btn btn-primary" (click)="screenPicker.click()">Upload screenshots</button>
                }
              </div>
            } @else {
              <div class="screens-grid">
                @for (screen of ds.screens; track screen.screenId; let idx = $index) {
                  <div class="screen-box card">
                    <div class="screen-box-header">
                      <span class="step-badge">Step #{{ idx + 1 }}</span>
                      @if (canEdit()) {
                        <div class="screen-order-btns">
                          <button type="button" class="icon-btn sm" [disabled]="idx === 0" (click)="moveScreen(idx, -1)" title="Move earlier">
                            <app-icon name="caret" />
                          </button>
                          <button type="button" class="icon-btn sm rotate-180" [disabled]="idx === ds.screens.length - 1" (click)="moveScreen(idx, 1)" title="Move later">
                            <app-icon name="caret" />
                          </button>
                          <button type="button" class="icon-btn sm danger" (click)="deleteScreen(screen)" title="Delete screenshot">
                            <app-icon name="close" />
                          </button>
                        </div>
                      }
                    </div>

                    <div class="screen-img-container">
                      <img [src]="'/api/attachments/' + screen.attachmentId + '?access_token=' + token()" [alt]="screen.caption || 'Screen ' + (idx + 1)" />
                    </div>

                    <div class="screen-caption-area">
                      @if (canEdit()) {
                        <input type="text" [(ngModel)]="screen.caption" (change)="saveScreenCaption(screen)"
                          placeholder="Caption / screen title..." class="caption-input" />
                      } @else {
                        <strong>{{ screen.caption || 'No caption' }}</strong>
                      }
                    </div>

                    @if (screen.screenSummary) {
                      <details class="summary-details">
                        <summary class="summary-toggle">AI Screen Analysis <span class="chip-dot"></span></summary>
                        <pre class="summary-pre">{{ screen.screenSummary }}</pre>
                      </details>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- TAB 2: PRODUCT DOCUMENTATION -->
        @if (activeTab() === 'documentation') {
          <ng-container *ngTemplateOutlet="documentTemplate; context: { kind: 'Documentation' }"></ng-container>
        }

        <!-- TAB 3: USER MANUAL -->
        @if (activeTab() === 'manual') {
          <ng-container *ngTemplateOutlet="documentTemplate; context: { kind: 'UserManual' }"></ng-container>
        }

        <!-- REUSABLE DOCUMENT TEMPLATE (Documentation / User Manual) -->
        <ng-template #documentTemplate let-kind="kind">
          @let docs = docsForKind(kind);
          @let activeDoc = selectedDoc(kind);
          @let job = activeJob(kind);

          <div class="doc-tab-content">
            <!-- Document Sub-Toolbar -->
            <div class="tab-toolbar doc-toolbar">
              <div class="doc-toolbar-left">
                <h2>{{ kind === 'Documentation' ? 'Product Specification & Documentation' : 'User Manual' }}</h2>
                @if (docs.length > 0) {
                  <div class="version-select-wrap">
                    <label for="verSelect-{{ kind }}" class="sr-only">Version</label>
                    <select id="verSelect-{{ kind }}" [ngModel]="activeDoc?.documentId" (ngModelChange)="selectVersion(kind, $event)">
                      @for (d of docs; track d.documentId) {
                        <option [value]="d.documentId">v{{ d.version }} ({{ d.status }}) · {{ d.source }} · {{ d.createdAt | date: 'shortDate' }}</option>
                      }
                    </select>
                  </div>
                }
              </div>

              @if (canEdit()) {
                <div class="doc-toolbar-right">
                  @if (kind === 'UserManual') {
                    <label class="reread-label" title="Force vision AI to re-analyze all screenshots rather than reusing cached summaries">
                      <input type="checkbox" [(ngModel)]="reReadManualScreens" /> Re-read screens
                    </label>
                  }
                  <button type="button" class="btn btn-primary" [disabled]="jobRunning(kind)" (click)="startGenerate(kind)">
                    @if (jobRunning(kind)) {
                      <span class="spinner"></span> Generating…
                    } @else {
                      <app-icon name="testcase" /> Generate with AI
                    }
                  </button>
                  <button type="button" class="btn btn-secondary" (click)="toggleManualPanel(kind)">
                    Manual / Import
                  </button>
                </div>
              }
            </div>

            <!-- Active Generation Job Status Banner -->
            @if (job) {
              <div class="card job-status-card" [class.job-failed]="job.status === 'Failed'" [class.job-completed]="job.status === 'Completed'">
                <div class="job-status-head">
                  <div class="job-status-title">
                    @if (job.status === 'Running' || job.status === 'Pending') {
                      <span class="spinner"></span>
                      <strong>AI Generating {{ kind }}:</strong>
                    } @else if (job.status === 'Failed') {
                      <app-icon name="alert" />
                      <strong>Generation Failed:</strong>
                    } @else {
                      <app-icon name="check" />
                      <strong>Completed:</strong>
                    }
                    <span>{{ job.progress }}</span>
                  </div>
                  @if (job.status === 'Failed' && canEdit()) {
                    <button type="button" class="btn btn-sm btn-primary" (click)="startGenerate(kind)">Retry</button>
                  }
                </div>
                @if (job.error) {
                  <p class="job-error-msg">{{ job.error }}</p>
                }
                @if (job.totalSteps > 0 && job.status === 'Running') {
                  <div class="progress-bar-wrap">
                    <div class="progress-bar-fill" [style.width.%]="(job.currentStep / job.totalSteps) * 100"></div>
                  </div>
                }
              </div>
            }

            <!-- Manual Route / Import Panel -->
            @if (manualPanelOpen(kind) && canEdit()) {
              <div class="card import-panel">
                <div class="import-panel-header">
                  <h3>Manual Route & Import</h3>
                  <button type="button" class="icon-btn" (click)="toggleManualPanel(kind)"><app-icon name="close" /></button>
                </div>
                <p class="muted small">No AI key configured or rate limit reached? Copy the ready-made prompt into ChatGPT, Claude or Gemini, then paste the markdown back below.</p>

                <div class="prompt-section">
                  <div class="prompt-header">
                    <strong>Ready-Made Prompt</strong>
                    <button type="button" class="btn btn-sm" (click)="copyPrompt(kind)">
                      <app-icon name="share" /> Copy Prompt
                    </button>
                  </div>
                  <pre class="prompt-preview">{{ currentPrompt(kind) }}</pre>
                </div>

                <div class="paste-section mt-3">
                  <label>Paste Generated Markdown
                    <textarea rows="6" [(ngModel)]="importMarkdown" placeholder="# Paste markdown here..."></textarea>
                  </label>
                  <div class="import-actions mt-2">
                    <button type="button" class="btn btn-primary" [disabled]="!importMarkdown.trim() || importing()" (click)="submitImport(kind)">
                      @if (importing()) { <span class="spinner"></span> Importing… } @else { Save as Imported Version }
                    </button>
                  </div>
                </div>
              </div>
            }

            <!-- Document Content View & Edit -->
            @if (activeDoc) {
              <div class="doc-viewer-card card">
                <div class="doc-viewer-bar">
                  <div class="doc-status-badge">
                    <span class="chip" [class.chip-success]="activeDoc.status === 'Approved'" [class.chip-warn]="activeDoc.status === 'Draft'">
                      {{ activeDoc.status }}
                    </span>
                    <span class="muted small">Version {{ activeDoc.version }} · Generated by {{ activeDoc.source }}</span>
                  </div>

                  <div class="doc-viewer-actions">
                    @if (canEdit()) {
                      @if (editMode(kind)) {
                        <button type="button" class="btn btn-sm btn-primary" [disabled]="savingDoc()" (click)="saveDoc(activeDoc, kind)">Save edits</button>
                        <button type="button" class="btn btn-sm" (click)="cancelEdit(kind)">Cancel</button>
                      } @else {
                        <button type="button" class="btn btn-sm" (click)="enterEdit(kind, activeDoc)">Edit Markdown</button>
                        @if (activeDoc.status === 'Draft') {
                          <button type="button" class="btn btn-sm btn-secondary" (click)="approveDoc(activeDoc)">Approve</button>
                        }
                      }
                    }

                    <!-- Export Menu Dropdown -->
                    <div class="export-dropdown-wrap">
                      <button type="button" class="btn btn-sm" (click)="toggleExportMenu(kind)">
                        Export <app-icon name="caret" />
                      </button>
                      @if (exportMenuOpen(kind)) {
                        <div class="menu export-menu" role="menu">
                          <button type="button" role="menuitem" (click)="export(activeDoc, 'docx', kind)">Word (.docx)</button>
                          <button type="button" role="menuitem" (click)="export(activeDoc, 'md', kind)">Markdown (.md)</button>
                          <button type="button" role="menuitem" (click)="export(activeDoc, 'html', kind)">HTML (Print to PDF)</button>
                        </div>
                      }
                    </div>
                  </div>
                </div>

                <!-- Display Mode -->
                @if (!editMode(kind)) {
                  <article class="markdown-preview" [innerHTML]="renderMarkdown(activeDoc.markdown)"></article>
                } @else {
                  <!-- Edit Mode -->
                  <div class="markdown-editor-pane">
                    <label class="sr-only" for="docEditor-{{ kind }}">Markdown Editor</label>
                    <textarea id="docEditor-{{ kind }}" rows="18" [(ngModel)]="editingText" class="doc-editor-textarea"></textarea>
                  </div>
                }
              </div>
            } @else {
              <div class="card empty">
                <h3>No {{ kind }} produced yet</h3>
                <p>Generate one using AI from the sequenced screenshots, or import markdown manually.</p>
                @if (canEdit()) {
                  <button type="button" class="btn btn-primary" (click)="startGenerate(kind)">Generate with AI</button>
                }
              </div>
            }
          </div>
        </ng-template>
      }
    </main>
  `,
})
export class QcDocSetDetailPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly maxImages = MAX_QC_DOCSET_IMAGES;
  readonly loading = signal(true);
  readonly docSet = signal<QcDocSet | null>(null);
  readonly activeTab = signal<Tab>('screens');
  readonly draggingScreens = signal(false);

  readonly token = computed(() => this.auth.getToken() ?? '');

  readonly canEdit = computed(() => {
    if (this.auth.isGuest()) return false;
    return canEditTickets(this.docSet()?.myRole);
  });

  // Jobs state per kind
  readonly documentationJob = signal<QcJobStatus | null>(null);
  readonly manualJob = signal<QcJobStatus | null>(null);
  private pollInterval: any = null;

  // Selected doc versions per kind
  readonly selectedDocId = signal<{ [key: string]: number }>({});

  // Edit mode
  readonly editState = signal<{ [key: string]: boolean }>({});
  editingText = '';
  readonly savingDoc = signal(false);

  // Manual import
  readonly manualPanelState = signal<{ [key: string]: boolean }>({});
  readonly promptText = signal<{ [key: string]: string }>({});
  importMarkdown = '';
  readonly importing = signal(false);

  // Export menu
  readonly exportMenuState = signal<{ [key: string]: boolean }>({});

  reReadManualScreens = false;

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('docsetId'));
    if (!id) {
      this.loading.set(false);
      return;
    }
    await this.loadDocSet(id);
    this.loading.set(false);

    // Auto-select latest doc for each kind
    this.initDefaultDocs();
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  async loadDocSet(id: number) {
    try {
      const ds = await this.api.qcDocSet(id);
      this.docSet.set(ds);
    } catch {
      this.docSet.set(null);
    }
  }

  docsForKind(kind: string): QcDocument[] {
    return (this.docSet()?.documents ?? []).filter((d) => d.kind === kind);
  }

  selectedDoc(kind: string): QcDocument | null {
    const docs = this.docsForKind(kind);
    const chosenId = this.selectedDocId()[kind];
    if (chosenId) {
      const found = docs.find((d) => d.documentId === chosenId);
      if (found) return found;
    }
    return docs[0] ?? null;
  }

  selectVersion(kind: string, docId: number) {
    this.selectedDocId.update((map) => ({ ...map, [kind]: Number(docId) }));
  }

  private initDefaultDocs() {
    for (const kind of ['Documentation', 'UserManual']) {
      const docs = this.docsForKind(kind);
      if (docs.length > 0) {
        this.selectedDocId.update((map) => ({ ...map, [kind]: docs[0].documentId }));
      }
    }
  }

  // --- Screens Tab actions ---

  @HostListener('window:paste', ['$event'])
  async onWindowPaste(event: ClipboardEvent) {
    if (this.activeTab() !== 'screens' || !this.canEdit()) return;
    if (isTextPasteInInput(event)) return;

    const images = extractImageFiles(event);
    if (!images.length) return;

    event.preventDefault();
    const currentCount = this.docSet()?.screens.length ?? 0;
    const normalized = normalizePastedFiles(images, currentCount);
    await this.uploadScreens(normalized);
  }

  onDragOverScreens(event: DragEvent) {
    if (!this.canEdit()) return;
    event.preventDefault();
    this.draggingScreens.set(true);
  }

  async onDropScreens(event: DragEvent) {
    if (!this.canEdit()) return;
    event.preventDefault();
    this.draggingScreens.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) {
      const currentCount = this.docSet()?.screens.length ?? 0;
      await this.uploadScreens(normalizePastedFiles(files, currentCount));
    }
  }

  async onAddScreens(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    await this.uploadScreens(files);
  }

  async uploadScreens(files: File[]) {
    const ds = this.docSet();
    if (!ds || files.length === 0) return;

    const remaining = this.maxImages - ds.screens.length;
    if (remaining <= 0) {
      this.toast.show(`A docset can hold at most ${this.maxImages} screenshots.`);
      return;
    }

    const accepted = files.filter((f) => ACCEPTED_TYPES.includes(f.type) || f.type.startsWith('image/')).slice(0, remaining);
    if (accepted.length < files.length) {
      this.toast.show('Non-image files were skipped or the limit was reached.');
    }
    if (accepted.length === 0) return;

    try {
      const webpFiles: File[] = [];
      const captions: string[] = [];
      for (let i = 0; i < accepted.length; i++) {
        const f = accepted[i];
        const baseName = (!f.name || f.name === 'image.png' || f.name === 'blob' || f.name === 'image')
          ? `Screenshot ${ds.screens.length + i + 1}`
          : f.name.replace(/\.[^.]+$/, '');
        const caption = baseName.replace(/[-_]/g, ' ');
        try {
          const dataUri = await shrink(f);
          const res = await fetch(dataUri);
          const blob = await res.blob();
          const webpFile = new File([blob], baseName + '.webp', { type: 'image/webp' });
          webpFiles.push(webpFile);
        } catch {
          webpFiles.push(f);
        }
        captions.push(caption);
      }

      await this.api.addQcScreens(ds.docSetId, webpFiles, captions);
      this.toast.show(webpFiles.length === 1 ? 'Screenshot added.' : `${webpFiles.length} screenshots added.`);
      await this.loadDocSet(ds.docSetId);
    } catch (err: any) {
      this.toast.show(err?.error?.detail || err?.message || 'Could not add screenshots.');
    }
  }

  async moveScreen(index: number, delta: number) {
    const ds = this.docSet();
    if (!ds) return;
    const screens = [...ds.screens];
    const target = index + delta;
    if (target < 0 || target >= screens.length) return;

    const temp = screens[index];
    screens[index] = screens[target];
    screens[target] = temp;

    // Reassign sort orders
    const updates = screens.map((s, i) => ({
      screenId: s.screenId,
      sortOrder: i + 1,
      caption: s.caption,
    }));

    try {
      await this.api.reorderQcScreens(ds.docSetId, updates);
      await this.loadDocSet(ds.docSetId);
    } catch {
      this.toast.show('Could not reorder screens.');
    }
  }

  async saveScreenCaption(screen: QcDocScreen) {
    const ds = this.docSet();
    if (!ds) return;
    try {
      await this.api.reorderQcScreens(ds.docSetId, [
        { screenId: screen.screenId, sortOrder: screen.sortOrder, caption: screen.caption },
      ]);
      this.toast.show('Caption saved.');
    } catch {
      this.toast.show('Could not save caption.');
    }
  }

  async deleteScreen(screen: QcDocScreen) {
    const ds = this.docSet();
    if (!ds) return;
    if (!(await this.confirm.ask({
      title: 'Delete screenshot?',
      message: `Are you sure you want to remove this screenshot?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    }))) return;

    try {
      await this.api.deleteQcScreen(ds.docSetId, screen.screenId);
      this.toast.show('Screenshot removed.');
      await this.loadDocSet(ds.docSetId);
    } catch {
      this.toast.show('Could not delete screenshot.');
    }
  }

  // --- Generation & Jobs ---

  activeJob(kind: string): QcJobStatus | null {
    return kind === 'Documentation' ? this.documentationJob() : this.manualJob();
  }

  jobRunning(kind: string): boolean {
    const j = this.activeJob(kind);
    return j != null && (j.status === 'Running' || j.status === 'Pending');
  }

  async startGenerate(kind: string) {
    const ds = this.docSet();
    if (!ds) return;
    if (ds.screens.length === 0) {
      this.toast.show('Add at least one screenshot before generating.');
      return;
    }

    try {
      const reRead = kind === 'UserManual' ? this.reReadManualScreens : false;
      const { jobId } = await this.api.generateQcDocument(ds.docSetId, kind, reRead);
      this.toast.show(`Started generating ${kind}...`);

      const initialStatus: QcJobStatus = {
        jobId,
        docSetId: ds.docSetId,
        kind: kind as any,
        status: 'Running',
        progress: 'Reading screen 1 of ' + ds.screens.length + '...',
        currentStep: 1,
        totalSteps: ds.screens.length + 1,
        error: null,
        documentId: null,
      };

      if (kind === 'Documentation') this.documentationJob.set(initialStatus);
      else this.manualJob.set(initialStatus);

      this.pollJob(jobId, kind);
    } catch (err: any) {
      this.toast.show(err?.error?.detail || err?.message || 'Could not start generation.');
    }
  }

  private pollJob(jobId: string, kind: string) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      try {
        const status = await this.api.qcJobStatus(jobId);
        if (kind === 'Documentation') this.documentationJob.set(status);
        else this.manualJob.set(status);

        if (status.status === 'Completed') {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.toast.show(`${kind} generated successfully!`);
          if (this.docSet()) {
            await this.loadDocSet(this.docSet()!.docSetId);
            if (status.documentId) {
              this.selectedDocId.update((m) => ({ ...m, [kind]: status.documentId! }));
            }
          }
        } else if (status.status === 'Failed') {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.toast.show(`Generation failed: ${status.error || 'Unknown error'}`);
        }
      } catch {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    }, 2000);
  }

  // --- Manual Route & Import ---

  manualPanelOpen(kind: string): boolean {
    return !!this.manualPanelState()[kind];
  }

  async toggleManualPanel(kind: string) {
    const next = !this.manualPanelOpen(kind);
    this.manualPanelState.update((m) => ({ ...m, [kind]: next }));
    if (next && !this.promptText()[kind] && this.docSet()) {
      try {
        const { prompt } = await this.api.qcDocSetPrompt(this.docSet()!.docSetId, kind);
        this.promptText.update((m) => ({ ...m, [kind]: prompt }));
      } catch {
        this.promptText.update((m) => ({ ...m, [kind]: 'Could not load prompt.' }));
      }
    }
  }

  currentPrompt(kind: string): string {
    return this.promptText()[kind] || 'Loading prompt…';
  }

  copyPrompt(kind: string) {
    const text = this.currentPrompt(kind);
    navigator.clipboard.writeText(text);
    this.toast.show('Prompt copied to clipboard.');
  }

  async submitImport(kind: string) {
    const ds = this.docSet();
    if (!ds || !this.importMarkdown.trim() || this.importing()) return;
    this.importing.set(true);
    try {
      const created = await this.api.importQcDocument(ds.docSetId, kind, this.importMarkdown.trim());
      this.toast.show(`Imported new ${kind} version.`);
      this.importMarkdown = '';
      this.manualPanelState.update((m) => ({ ...m, [kind]: false }));
      await this.loadDocSet(ds.docSetId);
      this.selectedDocId.update((m) => ({ ...m, [kind]: created.documentId }));
    } catch (err: any) {
      this.toast.show(err?.error?.detail || err?.message || 'Could not import markdown.');
    } finally {
      this.importing.set(false);
    }
  }

  // --- View, Edit, Approve & Export ---

  editMode(kind: string): boolean {
    return !!this.editState()[kind];
  }

  enterEdit(kind: string, doc: QcDocument) {
    this.editingText = doc.markdown;
    this.editState.update((m) => ({ ...m, [kind]: true }));
  }

  cancelEdit(kind: string) {
    this.editState.update((m) => ({ ...m, [kind]: false }));
  }

  async saveDoc(doc: QcDocument, kind: string) {
    if (this.savingDoc()) return;
    this.savingDoc.set(true);
    try {
      await this.api.updateQcDocument(doc.documentId, { markdown: this.editingText });
      doc.markdown = this.editingText;
      this.editState.update((m) => ({ ...m, [kind]: false }));
      this.toast.show('Document saved.');
    } catch {
      this.toast.show('Could not save changes.');
    } finally {
      this.savingDoc.set(false);
    }
  }

  async approveDoc(doc: QcDocument) {
    try {
      await this.api.updateQcDocument(doc.documentId, { status: 'Approved' });
      doc.status = 'Approved';
      this.toast.show('Document approved.');
      if (this.docSet()) await this.loadDocSet(this.docSet()!.docSetId);
    } catch {
      this.toast.show('Could not approve document.');
    }
  }

  exportMenuOpen(kind: string): boolean {
    return !!this.exportMenuState()[kind];
  }

  toggleExportMenu(kind: string) {
    this.exportMenuState.update((m) => ({ ...m, [kind]: !m[kind] }));
  }

  async export(doc: QcDocument, format: 'docx' | 'md' | 'html', kind: string) {
    this.exportMenuState.update((m) => ({ ...m, [kind]: false }));
    const ds = this.docSet();
    if (!ds) return;
    try {
      await this.api.downloadQcExport(doc.documentId, format, ds.appName, doc.kind, doc.version);
      this.toast.show(`Downloading ${format.toUpperCase()} export...`);
    } catch {
      this.toast.show('Export download failed.');
    }
  }

  renderMarkdown(markdown: string): string {
    if (!markdown) return '';
    // Basic safe HTML renderer for markdown preview
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br>');
  }
}
