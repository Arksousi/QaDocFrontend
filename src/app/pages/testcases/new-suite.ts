import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { TestSuite } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-new-suite',
  imports: [FormsModule, Modal, Icon],
  template: `
    <app-modal [heading]="modalHeading()" (closed)="closed.emit()">
      @if (!suite()) {
        <div class="mode-tabs" role="tablist" aria-label="Creation mode">
          <button type="button" role="tab" [class.active]="tab() === 'crawl'"
            [attr.aria-selected]="tab() === 'crawl'" (click)="tab.set('crawl')">
            <app-icon name="testcase" /> Crawl a site
          </button>
          <button type="button" role="tab" [class.active]="tab() === 'doc'"
            [attr.aria-selected]="tab() === 'doc'" (click)="tab.set('doc')">
            <app-icon name="template" /> Upload a Document
          </button>
          <button type="button" role="tab" [class.active]="tab() === 'html'"
            [attr.aria-selected]="tab() === 'html'" (click)="tab.set('html')">
            <app-icon name="template" /> Upload HTML files (Offline)
          </button>
        </div>
      }

      @if (tab() === 'crawl' || suite()) {
        <form id="crawlSuiteForm" class="form" (ngSubmit)="saveCrawl()">
          <div class="field">
            <label for="suiteProject">Project</label>
            <input id="suiteProject" [value]="projectName()" disabled />
          </div>

          <label>Start URL *
            <input name="startUrl" [(ngModel)]="startUrl" required type="url" autofocus
              placeholder="https://app.example.com" />
            <span class="hint">The initial page or login URL. Must be HTTP or HTTPS.</span>
          </label>

          <div class="grid-2">
            <label>Suite title
              <input name="title" [(ngModel)]="title" maxlength="200"
                placeholder="e.g. Web App Crawl - $(date)" />
            </label>
            <label>Max pages to crawl
              <input name="maxPages" type="number" min="1" max="1000" [(ngModel)]="maxPages"
                placeholder="600" />
            </label>
          </div>

          <div class="grid-2">
            <label>Username / Email (optional)
              <input name="username" [(ngModel)]="username" autocomplete="username"
                placeholder="e.g. admin@stms.local or testuser" />
            </label>
            <label>Password (optional)
              <input name="password" [(ngModel)]="password" type="password" autocomplete="current-password"
                placeholder="••••••••" />
            </label>
          </div>
          <span class="hint" style="margin-top: -0.5rem; margin-bottom: 0.5rem; display: block;">
            If the application requires login, enter credentials so Q Desk logs in and crawls internal pages. Credentials are held in memory during the crawl only and never stored in the database.
          </span>

          <label>Business context / Notes
            <textarea name="notes" [(ngModel)]="notes" rows="3" maxlength="20000"
              placeholder="What this app does, key flows to emphasize, edge cases to watch for."></textarea>
          </label>
        </form>
      } @else if (tab() === 'doc') {
        <form id="docSuiteForm" class="form" (ngSubmit)="saveDoc()">
          <p class="notice notice-info" role="note">
            <app-icon name="template" />
            <span>Upload a PDF or Word document (SRS, PRD, Functional Spec, or User Manual). The document will be analyzed and converted into test cases.</span>
          </p>

          <div class="field">
            <label for="docProject">Project</label>
            <input id="docProject" [value]="projectName()" disabled />
          </div>

          <label>Suite title *
            <input name="docTitle" [(ngModel)]="docTitle" required maxlength="200"
              placeholder="e.g. System Requirements Specification" />
          </label>

          <div class="field">
            <label>PDF or Word files *</label>
            <div class="dropzone"
              [class.dragging]="docDragging()"
              (click)="docPicker.click()"
              (dragover)="onDocDragOver($event)"
              (dragleave)="docDragging.set(false)"
              (drop)="onDocDrop($event)"
              role="button" tabindex="0" (keydown.enter)="docPicker.click()">
              <app-icon name="template" />
              <p><strong>Click to browse</strong> or drag PDF / Word files here</p>
              <span class="hint">Supports .pdf, .docx, and .doc files</span>
            </div>
            <input #docPicker id="docFiles" type="file"
              accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              multiple hidden (change)="onDocFilesPicked($event)" />
            @if (docFiles().length) {
              <p class="hint" style="color: var(--primary); font-weight: 600; margin-top: 4px;">
                ✓ {{ docFiles().length }} file(s) selected: {{ docFileNames() }}
              </p>
            }
          </div>

          <label>Business context / Notes
            <textarea name="docNotes" [(ngModel)]="docNotes" rows="3" maxlength="20000"
              placeholder="Optional context, specific modules to focus on, or testing rules."></textarea>
          </label>
        </form>
      } @else {
        <form id="htmlSuiteForm" class="form" (ngSubmit)="saveHtml()">
          <p class="notice notice-info" role="note">
            <app-icon name="template" />
            <span>Upload raw HTML pages from local or intranet applications. HTML will be sanitized and converted into test cases.</span>
          </p>

          <div class="field">
            <label for="htmlProject">Project</label>
            <input id="htmlProject" [value]="projectName()" disabled />
          </div>

          <label>Suite title *
            <input name="htmlTitle" [(ngModel)]="htmlTitle" required maxlength="200"
              placeholder="e.g. Offline Intranet Pages" />
          </label>

          <div class="field">
            <label>HTML files *</label>
            <div class="dropzone" (click)="htmlPicker.click()" role="button" tabindex="0" (keydown.enter)="htmlPicker.click()">
              <app-icon name="template" />
              <p><strong>Click to browse</strong> or drag HTML files here</p>
              <span class="hint">Upload one or multiple .html or .htm files</span>
            </div>
            <input #htmlPicker id="htmlFiles" type="file" accept=".html,.htm,text/html" multiple hidden (change)="onHtmlFilesPicked($event)" />
            @if (htmlFiles().length) {
              <p class="hint" style="color: var(--primary); font-weight: 600; margin-top: 4px;">✓ {{ htmlFiles().length }} file(s) selected.</p>
            }
          </div>

          <label>Business context / Notes
            <textarea name="htmlNotes" [(ngModel)]="htmlNotes" rows="3" maxlength="20000"
              placeholder="Context about these pages."></textarea>
          </label>
        </form>
      }

      <ng-container modal-actions>
        <button class="btn btn-ghost" type="button" (click)="closed.emit()">Cancel</button>
        @if (suite()) {
          <button class="btn btn-ghost" type="button"
            [disabled]="saving() || !title.trim()" (click)="saveSettingsOnly()">
            Save settings
          </button>
          <button class="btn btn-primary" type="submit" form="crawlSuiteForm"
            [disabled]="saving() || !startUrl.trim()">
            @if (saving()) {
              <span class="spinner" aria-hidden="true"></span> Starting crawl…
            } @else {
              Save & Re-crawl
            }
          </button>
        } @else if (tab() === 'crawl') {
          <button class="btn btn-primary" type="submit" form="crawlSuiteForm"
            [disabled]="saving() || !startUrl.trim() ">
            @if (saving()) {
              <span class="spinner" aria-hidden="true"></span> Starting crawl…
            } @else {
              Crawl & Generate
            }
          </button>
        } @else if (tab() === 'doc') {
          <button class="btn btn-primary" type="submit" form="docSuiteForm"
            [disabled]="saving() || !docTitle.trim() || docFiles().length === 0">
            @if (saving()) {
              <span class="spinner" aria-hidden="true"></span> Analyzing document…
            } @else {
              Upload & Generate
            }
          </button>
        } @else {
          <button class="btn btn-primary" type="submit" form="htmlSuiteForm"
            [disabled]="saving() || !htmlTitle.trim() || htmlFiles().length === 0">
            @if (saving()) {
              <span class="spinner" aria-hidden="true"></span> Uploading…
            } @else {
              Upload & Generate
            }
          </button>
        }
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
    }
    .mode-tabs button {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.75rem;
      border: none;
      background: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--muted);
    }
    .mode-tabs button.active {
      background: var(--bg-card);
      color: var(--fg);
      font-weight: 600;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
  `],
})
export class NewSuite implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<number>();
  readonly projectName = input('');
  readonly suite = input<TestSuite | null>(null);
  readonly closed = output<void>();
  readonly created = output<number>();
  readonly updated = output<TestSuite>();
  readonly crawlStarted = output<{ jobId: string; suiteId: number }>();

  readonly tab = signal<'crawl' | 'doc' | 'html'>('crawl');
  readonly saving = signal(false);

  // Crawl fields
  startUrl = '';
  title = '';
  username = '';
  password = '';
  pathPrefix = '';
  maxPages = 600;
  extraUrlsText = '';
  storageStateJson: string | null = null;
  notes = '';
  authorized = true;

  // Document upload fields (PDF / Word)
  docTitle = '';
  docNotes = '';
  readonly docFiles = signal<File[]>([]);
  readonly docDragging = signal(false);

  // HTML upload fields
  htmlTitle = '';
  htmlNotes = '';
  readonly htmlFiles = signal<File[]>([]);

  modalHeading(): string {
    const s = this.suite();
    if (s) return 'Edit crawl settings · ' + s.title;
    if (this.tab() === 'doc') return 'New test suite · Upload a Document';
    if (this.tab() === 'html') return 'New test suite · Upload HTML files';
    return 'New test suite · Crawl a site';
  }

  docFileNames(): string {
    return this.docFiles().map((f) => f.name).join(', ');
  }

  async ngOnInit() {
    const existing = this.suite();
    if (existing) {
      this.title = existing.title;
      this.notes = existing.businessDescription ?? '';
      this.startUrl = existing.startUrl && !existing.startUrl.startsWith('local://') && !existing.startUrl.startsWith('doc://') && existing.startUrl !== 'offline-upload'
        ? existing.startUrl
        : '';
      if (!this.startUrl) {
        try {
          const job = await this.api.latestCrawlJobForSuite(existing.suiteId);
          if (job?.startUrl && !job.startUrl.startsWith('local://') && !job.startUrl.startsWith('doc://') && job.startUrl !== 'offline-upload') {
            this.startUrl = job.startUrl;
          }
        } catch {
          // Ignore if no previous crawl job exists
        }
      }
    }
  }

  onStorageStatePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.storageStateJson = reader.result as string;
      this.toast.success('Storage state loaded.');
    };
    reader.readAsText(file);
  }

  onDocFilesPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    this.setDocFiles(Array.from(input.files ?? []));
  }

  onDocDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.docDragging.set(true);
  }

  onDocDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.docDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      /\.(pdf|docx|doc)$/i.test(f.name)
    );
    if (files.length === 0) {
      this.toast.error('Please drop a PDF (.pdf) or Word (.docx, .doc) file.');
      return;
    }
    this.setDocFiles(files);
  }

  private setDocFiles(files: File[]) {
    this.docFiles.set(files);
    if (!this.docTitle.trim() && files.length > 0) {
      this.docTitle = files[0].name.replace(/\.[^.]+$/, '');
    }
  }

  onHtmlFilesPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.htmlFiles.set(files);
  }

  async saveSettingsOnly() {
    const existing = this.suite();
    if (!existing || !this.title.trim() || this.saving()) return;

    this.saving.set(true);
    try {
      const updated = await this.api.updateTestSuite(existing.suiteId, {
        title: this.title.trim(),
        description: this.notes.trim() || null,
        startUrl: this.startUrl.trim() || null,
      });
      this.toast.success('Crawl settings saved.');
      this.updated.emit(updated);
      this.closed.emit();
    } catch (err: any) {
      this.toast.error(err?.error?.detail || err?.message || 'Failed to save crawl settings.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveCrawl() {
    if (!this.startUrl.trim() || this.saving()) return;

    this.saving.set(true);
    try {
      const extraUrls = this.extraUrlsText
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const res = await this.api.startCrawlJob({
        projectId: this.projectId(),
        suiteId: this.suite()?.suiteId ?? undefined,
        suiteTitle: this.title.trim() || undefined,
        startUrl: this.startUrl.trim(),
        username: this.username.trim() || undefined,
        password: this.password || undefined,
        maxPages: Math.min(1000, Math.max(1, Number(this.maxPages) || 600)),
        pathPrefix: this.pathPrefix.trim() || undefined,
        extraUrls: extraUrls.length ? extraUrls : undefined,
        storageStateJson: this.storageStateJson || undefined,
        notes: this.notes.trim() || undefined,
        authorized: this.authorized,
      });

      this.toast.success('Crawl job started.');
      this.crawlStarted.emit({ jobId: res.jobId, suiteId: res.suiteId });
      this.created.emit(res.suiteId);
    } catch (err: any) {
      this.toast.error(err?.error?.detail || err?.message || 'Failed to start crawl.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveDoc() {
    if (!this.docTitle.trim() || !this.docFiles().length || this.saving()) return;

    this.saving.set(true);
    try {
      const res = await this.api.uploadCrawlDocument(
        this.projectId(),
        this.docTitle.trim(),
        this.docNotes.trim() || undefined,
        this.docFiles(),
      );

      this.toast.success(`Uploaded ${this.docFiles().length} document(s). Generating test cases…`);
      this.crawlStarted.emit({ jobId: res.jobId, suiteId: res.suiteId });
      this.created.emit(res.suiteId);
    } catch (err: any) {
      this.toast.error(err?.error?.detail || err?.message || 'Failed to upload document.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveHtml() {
    if (!this.htmlTitle.trim() || !this.htmlFiles().length || this.saving()) return;

    this.saving.set(true);
    try {
      const res = await this.api.uploadCrawlHtml(
        this.projectId(),
        this.htmlTitle.trim(),
        this.htmlNotes.trim() || undefined,
        this.htmlFiles(),
      );

      this.toast.success(`Uploaded ${this.htmlFiles().length} HTML files.`);
      this.crawlStarted.emit({ jobId: res.jobId, suiteId: res.suiteId });
      this.created.emit(res.suiteId);
    } catch (err: any) {
      this.toast.error(err?.error?.detail || err?.message || 'Failed to upload HTML.');
    } finally {
      this.saving.set(false);
    }
  }
}

