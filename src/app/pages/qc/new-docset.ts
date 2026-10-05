import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { MAX_QC_DOCSET_IMAGES } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { extractImageFiles, isTextPasteInInput, normalizePastedFiles } from '../../shared/clipboard';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { shrink } from '../../shared/rich-text';

interface Shot {
  key: number;
  name: string;
  url: string;
  file: File;
  caption: string;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-new-docset',
  imports: [FormsModule, Modal, Icon],
  template: `
    <app-modal [heading]="modalHeading()" (closed)="closed.emit()">
      <!-- Step progress indicators -->
      <div class="wizard-steps" role="navigation" aria-label="Wizard Steps">
        <button type="button" class="wizard-step" [class.active]="step() === 1" [class.done]="step() > 1" (click)="goToStep(1)">
          <span class="step-num">1</span> Details
        </button>
        <button type="button" class="wizard-step" [class.active]="step() === 2" [class.done]="step() > 2" (click)="goToStep(2)">
          <span class="step-num">2</span> Logo
        </button>
        <button type="button" class="wizard-step" [class.active]="step() === 3" [class.done]="step() > 3" (click)="goToStep(3)">
          <span class="step-num">3</span> Screenshots
        </button>
        <button type="button" class="wizard-step" [class.active]="step() === 4" [class.done]="step() > 4" (click)="goToStep(4)">
          <span class="step-num">4</span> Review
        </button>
      </div>

      <!-- Step 1: Basic Information -->
      @if (step() === 1) {
        <div class="wizard-pane">
          <div class="field">
            <label for="docsetProject">Project</label>
            <input id="docsetProject" [value]="projectName()" disabled />
            <span class="hint">Documentation sets belong to this project and reuse its membership.</span>
          </div>

          <label>Document Set Title *
            <input name="title" [(ngModel)]="title" required maxlength="200" autofocus
              placeholder="e.g. End-to-End Checkout Workflow" />
          </label>

          <label>Application Name *
            <input name="appName" [(ngModel)]="appName" required maxlength="200"
              placeholder="e.g. E-Commerce Web Portal" />
          </label>

          <label>Target Language
            <select name="language" [(ngModel)]="language">
              <option value="en">English</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="fr">Français (French)</option>
              <option value="de">Deutsch (German)</option>
              <option value="es">Español (Spanish)</option>
            </select>
            <span class="hint">The language used when generating specifications and user manuals.</span>
          </label>

          <label>Business Description
            <textarea name="description" [(ngModel)]="description" rows="3" maxlength="50000"
              placeholder="System context, target audience, business goals, and special domain considerations."></textarea>
            <span class="hint">Provides background for the AI to contextualize the visible UI elements.</span>
          </label>
        </div>
      }

      <!-- Step 2: Application Logo -->
      @if (step() === 2) {
        <div class="wizard-pane">
          <p class="muted">Upload your application logo. The logo appears on generated document headers and cover pages (it is not sent to external AI).</p>

          @if (logoUrl()) {
            <div class="logo-preview-card">
              <img [src]="logoUrl()" alt="App logo preview" class="logo-preview-img" />
              <div class="logo-preview-meta">
                <span class="file-name">{{ logoFile()?.name }}</span>
                <div class="actions">
                  <button type="button" class="btn btn-sm" (click)="logoPicker.click()">Replace logo</button>
                  <button type="button" class="btn btn-sm btn-ghost danger" (click)="removeLogo()">Remove</button>
                </div>
              </div>
            </div>
          } @else {
            <div class="dropzone logo-dropzone" [class.dragging]="logoDragging()" role="button" tabindex="0"
              (click)="logoPicker.click()"
              (dragover)="onLogoDragOver($event)" (dragleave)="logoDragging.set(false)" (drop)="onLogoDrop($event)"
              (keydown.enter)="logoPicker.click()" (keydown.space)="logoPicker.click(); $event.preventDefault()">
              <app-icon name="picture" />
              <p>Click to choose, drag, or paste application logo (Ctrl+V)</p>
              <p class="hint">PNG, JPEG or WebP · recommended max width 400px</p>
            </div>
          }
          <input #logoPicker type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onLogoPicked(logoPicker)" />
        </div>
      }

      <!-- Step 3: Ordered Screenshots -->
      @if (step() === 3) {
        <div class="wizard-pane">
          <p class="notice notice-warn" role="note">
            <app-icon name="alert" />
            <span>Screenshots are sent to an external AI service. Do not upload real customer data.</span>
          </p>

          <div class="dropzone" [class.dragging]="dragging()" role="button" tabindex="0"
            (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)"
            (keydown.enter)="picker.click()" (keydown.space)="picker.click(); $event.preventDefault()">
            <app-icon name="picture" />
            <p>Drag screenshots here in sequence, paste (Ctrl+V), or <button type="button" class="link-btn" (click)="picker.click()">choose files</button></p>
            <p class="hint">PNG, JPEG or WebP · up to {{ maxImages }} screens per docset</p>
            <input #picker type="file" accept="image/png,image/jpeg,image/webp" multiple hidden (change)="onPick(picker)" />
          </div>

          <p class="hint shot-count" role="status">{{ shots().length }} / {{ maxImages }} screenshots</p>

          @if (shots().length) {
            <div class="qc-screen-list" role="list" aria-label="Screenshots arranged in order">
              @for (s of shots(); track s.key; let idx = $index) {
                <div class="qc-screen-item" role="listitem">
                  <span class="screen-index-badge">#{{ idx + 1 }}</span>
                  <div class="screen-thumb-box">
                    <img [src]="s.url" [alt]="s.name" />
                  </div>
                  <div class="screen-caption-input">
                    <input type="text" [(ngModel)]="s.caption" placeholder="Step / Screen caption, e.g. Login Screen"
                      [attr.aria-label]="'Caption for screen ' + (idx + 1)" />
                  </div>
                  <div class="screen-order-actions">
                    <button type="button" class="icon-btn" [disabled]="idx === 0" (click)="move(idx, -1)" title="Move up" aria-label="Move screen up">
                      <app-icon name="caret" />
                    </button>
                    <button type="button" class="icon-btn rotate-180" [disabled]="idx === shots().length - 1" (click)="move(idx, 1)" title="Move down" aria-label="Move screen down">
                      <app-icon name="caret" />
                    </button>
                    <button type="button" class="icon-btn danger" (click)="remove(idx)" title="Remove screen" aria-label="Remove screen">
                      <app-icon name="close" />
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Step 4: Review & Create -->
      @if (step() === 4) {
        <div class="wizard-pane review-pane">
          <h3>Review Document Set</h3>
          <div class="review-grid">
            <div class="review-item"><strong>Title:</strong> {{ title }}</div>
            <div class="review-item"><strong>App Name:</strong> {{ appName }}</div>
            <div class="review-item"><strong>Language:</strong> {{ language.toUpperCase() }}</div>
            <div class="review-item"><strong>Logo:</strong> {{ logoFile() ? logoFile()!.name : 'None' }}</div>
            <div class="review-item span-2"><strong>Screens:</strong> {{ shots().length }} screens in sequence</div>
            @if (description) {
              <div class="review-item span-2"><strong>Description:</strong> {{ description }}</div>
            }
          </div>

          @if (shots().length > 0) {
            <h4 class="mt-4">Sequence of Screens</h4>
            <ol class="review-shot-sequence">
              @for (s of shots(); track s.key; let idx = $index) {
                <li>
                  <strong>#{{ idx + 1 }}</strong>: {{ s.caption || s.name }}
                </li>
              }
            </ol>
          } @else {
            <p class="notice notice-warn">Note: No screenshots selected. You will need to add screenshots before generating documentation.</p>
          }
        </div>
      }

      <!-- Dialog Footer -->
      <div class="modal-footer wizard-footer">
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>

        <div class="step-nav-actions">
          @if (step() > 1) {
            <button type="button" class="btn" (click)="prevStep()">Back</button>
          }
          @if (step() < 4) {
            <button type="button" class="btn btn-primary" (click)="nextStep()" [disabled]="!canProceedNext()">Next</button>
          } @else {
            <button type="button" class="btn btn-primary" [disabled]="saving() || !title.trim() || !appName.trim()" (click)="save()">
              @if (saving()) { <span class="spinner" aria-hidden="true"></span> Creating… } @else { Create Doc Set }
            </button>
          }
        </div>
      </div>
    </app-modal>
  `,
})
export class NewDocSetModal {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<number>();
  readonly projectName = input.required<string>();

  readonly closed = output<void>();
  readonly created = output<number>();

  readonly maxImages = MAX_QC_DOCSET_IMAGES;
  readonly step = signal<1 | 2 | 3 | 4>(1);
  readonly saving = signal(false);
  readonly dragging = signal(false);
  readonly logoDragging = signal(false);

  title = '';
  appName = '';
  language = 'en';
  description = '';

  readonly logoFile = signal<File | null>(null);
  readonly logoUrl = signal<string | null>(null);

  readonly shots = signal<Shot[]>([]);
  private nextKey = 1;

  @HostListener('window:paste', ['$event'])
  async onWindowPaste(event: ClipboardEvent) {
    if (isTextPasteInInput(event)) return;
    const images = extractImageFiles(event);
    if (!images.length) return;

    if (this.step() === 2) {
      event.preventDefault();
      await this.processLogoFile(images[0]);
    } else if (this.step() === 3) {
      event.preventDefault();
      const normalized = normalizePastedFiles(images, this.shots().length);
      await this.addFiles(normalized);
    }
  }

  modalHeading() {
    switch (this.step()) {
      case 1: return 'New Doc Set — (1/4) Details';
      case 2: return 'New Doc Set — (2/4) Application Logo';
      case 3: return 'New Doc Set — (3/4) Sequenced Screenshots';
      case 4: return 'New Doc Set — (4/4) Review & Create';
    }
  }

  goToStep(target: 1 | 2 | 3 | 4) {
    if (target > 1 && (!this.title.trim() || !this.appName.trim())) {
      this.toast.show('Please provide a title and application name first.');
      return;
    }
    this.step.set(target);
  }

  nextStep() {
    if (this.canProceedNext()) {
      this.step.update((s) => (s + 1) as 1 | 2 | 3 | 4);
    }
  }

  prevStep() {
    this.step.update((s) => (s - 1) as 1 | 2 | 3 | 4);
  }

  canProceedNext(): boolean {
    if (this.step() === 1) return !!this.title.trim() && !!this.appName.trim();
    return true;
  }

  onLogoDragOver(e: DragEvent) {
    e.preventDefault();
    this.logoDragging.set(true);
  }

  async onLogoDrop(e: DragEvent) {
    e.preventDefault();
    this.logoDragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) await this.processLogoFile(files[0]);
  }

  async onLogoPicked(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.processLogoFile(file);
  }

  async processLogoFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      this.toast.show('The logo must be a PNG, JPEG or WebP image.');
      return;
    }
    try {
      const dataUri = await shrink(file);
      const res = await fetch(dataUri);
      const blob = await res.blob();
      const baseName = (!file.name || file.name === 'image.png' || file.name === 'blob')
        ? 'logo'
        : file.name.replace(/\.[^.]+$/, '');
      const webpFile = new File([blob], baseName + '.webp', { type: 'image/webp' });

      if (this.logoUrl()) URL.revokeObjectURL(this.logoUrl()!);
      this.logoFile.set(webpFile);
      this.logoUrl.set(URL.createObjectURL(webpFile));
      this.toast.show('Logo updated.');
    } catch {
      this.toast.show('Could not process the logo image.');
    }
  }

  removeLogo() {
    if (this.logoUrl()) URL.revokeObjectURL(this.logoUrl()!);
    this.logoFile.set(null);
    this.logoUrl.set(null);
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(true);
  }

  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    if (e.dataTransfer?.files) {
      const files = Array.from(e.dataTransfer.files);
      await this.addFiles(normalizePastedFiles(files, this.shots().length));
    }
  }

  async onPick(input: HTMLInputElement) {
    if (input.files) await this.addFiles(Array.from(input.files));
    input.value = '';
  }

  private async addFiles(files: File[]) {
    const current = this.shots();
    const remaining = this.maxImages - current.length;
    if (remaining <= 0) {
      this.toast.show(`A docset can hold at most ${this.maxImages} screenshots.`);
      return;
    }

    const accepted = files.filter((f) => ACCEPTED.includes(f.type)).slice(0, remaining);
    if (accepted.length < files.length) {
      this.toast.show('Non-image files were skipped or the limit was reached.');
    }

    const added: Shot[] = [];
    for (let i = 0; i < accepted.length; i++) {
      const f = accepted[i];
      const fallbackName = (!f.name || f.name === 'image.png' || f.name === 'blob' || f.name === 'image')
        ? `Screenshot ${current.length + i + 1}`
        : f.name.replace(/\.[^.]+$/, '');
      const caption = fallbackName.replace(/[-_]/g, ' ');
      try {
        const dataUri = await shrink(f);
        const res = await fetch(dataUri);
        const blob = await res.blob();
        const webpFile = new File([blob], fallbackName + '.webp', { type: 'image/webp' });
        added.push({
          key: this.nextKey++,
          name: fallbackName + '.webp',
          url: URL.createObjectURL(webpFile),
          file: webpFile,
          caption,
        });
      } catch {
        // Fallback to original
        added.push({
          key: this.nextKey++,
          name: f.name || fallbackName,
          url: URL.createObjectURL(f),
          file: f,
          caption,
        });
      }
    }

    this.shots.set([...current, ...added]);
  }

  move(index: number, delta: number) {
    const list = [...this.shots()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;
    this.shots.set(list);
  }

  remove(index: number) {
    const list = [...this.shots()];
    const [removed] = list.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    this.shots.set(list);
  }

  async save() {
    if (this.saving()) return;
    if (!this.title.trim() || !this.appName.trim()) {
      this.toast.show('Please provide a title and application name.');
      return;
    }

    this.saving.set(true);
    try {
      const images = this.shots().map((s) => s.file);
      const captions = this.shots().map((s) => s.caption);

      const created = await this.api.createQcDocSet(
        this.projectId(),
        this.title.trim(),
        this.appName.trim(),
        this.description.trim(),
        this.language,
        this.logoFile(),
        images,
        captions,
      );

      this.toast.show('Documentation set created.');
      this.created.emit(created.id);
    } catch (err: any) {
      this.toast.show(err?.error?.detail || err?.message || 'Could not create doc set.');
    } finally {
      this.saving.set(false);
    }
  }
}
