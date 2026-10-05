import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { MAX_SUITE_IMAGES } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { extractImageFiles, isTextPasteInInput, normalizePastedFiles } from '../../shared/clipboard';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { shrink } from '../../shared/rich-text';

/** One screenshot waiting to go up: the thumbnail to show, and the bytes to send. */
interface Shot {
  key: number;
  name: string;
  url: string;
  file: File;
}

/** Only what a browser re-encodes reliably and the API accepts (the server checks the bytes too). */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The "New suite" dialog: a title, the business description, and the screenshots the model will
 * be shown. Pictures go through the same shrink-to-WebP pipeline as ticket descriptions, so a
 * suite upload is a few hundred kilobytes rather than a few megabytes.
 */
@Component({
  selector: 'app-new-suite',
  imports: [FormsModule, Modal, Icon],
  template: `
    <app-modal heading="New test suite" (closed)="closed.emit()">
      <form id="newSuiteForm" class="form" (ngSubmit)="save()">
        <!-- Said out loud, before anything is chosen: what leaves this machine, and what not to put in it. -->
        <p class="notice notice-warn" role="note">
          <app-icon name="alert" />
          <span>Screenshots are sent to an external AI service. Do not upload real customer data.</span>
        </p>

        <div class="field">
          <label for="suiteProject">Project</label>
          <input id="suiteProject" [value]="projectName()" disabled aria-describedby="suiteProjectHint" />
          <span id="suiteProjectHint" class="hint">Test cases belong to this project and use its membership.</span>
        </div>

        <label>Title *
          <input name="title" [(ngModel)]="title" required maxlength="200" autofocus
            placeholder="e.g. Checkout flow on mobile" />
        </label>

        <label>Business description
          <textarea name="description" [(ngModel)]="description" rows="4" maxlength="20000"
            placeholder="What the application does, what matters here, what a correct result looks like."></textarea>
          <span class="hint">The model is told to test only what it can see in the screenshots and read here.</span>
        </label>

        <div class="field">
          <label id="shotsLabel">Screenshots</label>
          <div class="dropzone" [class.dragging]="dragging()" role="button" tabindex="0"
            aria-labelledby="shotsLabel"
            (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)"
            (paste)="onPaste($event)"
            (keydown.enter)="picker.click()" (keydown.space)="picker.click(); $event.preventDefault()">
            <app-icon name="picture" />
            <p>Drag screenshots here, paste (Ctrl+V), or <button type="button" class="link-btn" (click)="picker.click()">choose files</button></p>
            <p class="hint">PNG, JPEG or WebP · paste or drag up to {{ maxImages }} per suite</p>
            <input #picker type="file" accept="image/png,image/jpeg,image/webp" multiple hidden (change)="onPick(picker)" />
          </div>

          <!-- The counter is the point: how many are in, and how many more there is room for. -->
          <p class="hint shot-count" role="status">{{ shots().length }} / {{ maxImages }} screenshots</p>

          @if (shots().length) {
            <ul class="shot-list" role="list" aria-label="Screenshots chosen">
              @for (s of shots(); track s.key) {
                <li class="shot">
                  <img [src]="s.url" [alt]="s.name" />
                  <button type="button" class="icon-btn shot-remove" (click)="remove(s)"
                    [attr.aria-label]="'Remove ' + s.name" title="Remove">
                    <app-icon name="close" />
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      </form>

      <ng-container modal-actions>
        <button class="btn btn-ghost" type="button" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" type="submit" form="newSuiteForm"
          [disabled]="saving() || !title.trim()">
          {{ saving() ? 'Creating…' : 'Create suite' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class NewSuite {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<number>();
  readonly projectName = input('');
  readonly closed = output<void>();
  /** The new suite's id, so the list can open it straight away. */
  readonly created = output<number>();

  readonly maxImages = MAX_SUITE_IMAGES;
  readonly saving = signal(false);
  readonly dragging = signal(false);
  readonly shots = signal<Shot[]>([]);

  title = '';
  description = '';
  private nextKey = 0;

  @HostListener('window:paste', ['$event'])
  onPaste(event: ClipboardEvent) {
    if (isTextPasteInInput(event)) return;
    const images = extractImageFiles(event);
    if (!images.length) return;
    event.preventDefault();
    const normalized = normalizePastedFiles(images, this.shots().length);
    void this.add(normalized);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    void this.add(normalizePastedFiles(files, this.shots().length));
  }

  onPick(picker: HTMLInputElement) {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    void this.add(files);
  }

  remove(shot: Shot) {
    this.shots.update((list) => list.filter((s) => s.key !== shot.key));
  }

  private async add(files: File[]) {
    const room = this.maxImages - this.shots().length;
    if (room <= 0) {
      this.toast.error(`A suite takes at most ${this.maxImages} screenshots.`);
      return;
    }
    if (files.length > room)
      this.toast.error(`Only ${room} more screenshot${room === 1 ? '' : 's'} fit (limit ${this.maxImages}).`);

    const accepted: Shot[] = [];
    for (const file of files.slice(0, room)) {
      if (!ACCEPTED.includes(file.type)) {
        this.toast.error(`“${file.name}” is not a PNG, JPEG or WebP picture.`);
        continue;
      }
      try {
        // The same shrink-to-1400px-WebP step ticket pictures take, so the upload stays small.
        const url = await shrink(file);
        const name = (!file.name || file.name === 'image.png' || file.name === 'blob')
          ? `Screenshot ${this.shots().length + accepted.length + 1}.png`
          : file.name;
        accepted.push({ key: ++this.nextKey, name, url, file: fromDataUrl(url, name) });
      } catch {
        this.toast.error(`“${file.name}” could not be read as a picture.`);
      }
    }
    if (accepted.length) this.shots.update((list) => [...list, ...accepted]);
  }

  async save() {
    const title = this.title.trim();
    if (!title || this.saving()) return;
    this.saving.set(true);
    try {
      const { id } = await this.api.createTestSuite(
        this.projectId(), title, this.description.trim(), this.shots().map((s) => s.file),
      );
      this.toast.success(`Suite “${title}” created.`);
      this.created.emit(id);
    } finally {
      this.saving.set(false);
    }
  }
}

/** A data URL back into a File: the browser already encoded it, so this only un-base64s it. */
function fromDataUrl(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(',');
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'image/webp';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name.replace(/\.[^.]+$/, '') + extensionFor(type), { type });
}

function extensionFor(type: string) {
  return type === 'image/jpeg' ? '.jpg' : type === 'image/png' ? '.png' : '.webp';
}
