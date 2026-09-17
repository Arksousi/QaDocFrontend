import { Component, ElementRef, SecurityContext, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { ImageViewer } from './image-viewer';
import { Modal } from './modal';

/** Largest description the API accepts (pictures are stored inline as data URLs). */
export const MAX_DESCRIPTION_LENGTH = 15_000_000;
const MAX_IMAGE_SIDE = 1400;
const IMAGE_QUALITY = 0.85;
/** Must match Attachments.MaxBytes on the server. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/** Captions are meant to be short labels ("Step 3 — error toast"), not paragraphs. */
export const MAX_TITLE_LENGTH = 80;

export interface Media {
  /** Identity for @for tracking only; never stored. Two pastes of one screenshot share a src. */
  key: number;
  kind: 'picture' | 'video';
  /** Pictures: a data URL. Videos: empty — the URL is built at render time with a fresh token. */
  src: string;
  /** Videos only: the row in ticketattachments. */
  attachmentId: number;
  /** The original file name, kept as a fallback label. */
  name: string;
  /** The caption the user typed, or empty. */
  title: string;
}

let nextKey = 0;

function pictureItem(src: string, name: string, title = ''): Media {
  return { key: ++nextKey, kind: 'picture', src, attachmentId: 0, name, title };
}

function videoItem(attachmentId: number, name: string, title = ''): Media {
  return { key: ++nextKey, kind: 'video', src: '', attachmentId, name, title };
}

/** What to show for an attachment: its caption when given, otherwise the file name. */
export function mediaLabel(item: Media) {
  return item.title.trim() || item.name;
}

/** The bug-report layout a description starts from, in the order the QA team asked for. */
export const TEMPLATE_SECTIONS = [
  { title: 'Actual Result', list: false },
  { title: 'Expected Result', list: false },
  { title: 'Steps to Reproduce', list: true },
] as const;

type TemplateSection = (typeof TEMPLATE_SECTIONS)[number];

const SECTION_TITLES: ReadonlySet<string> = new Set(TEMPLATE_SECTIONS.map((s) => s.title));

/**
 * Headings are marked non-editable so typing can never land inside one. `<br>` keeps each empty
 * paragraph or list item tall enough to click into.
 */
function templateHtml(sections: readonly TemplateSection[]) {
  return sections
    .map((s) => `<h4 class="rte-section" contenteditable="false">${s.title}</h4>${s.list ? '<ol><li><br></li></ol>' : '<p><br></p>'}`)
    .join('');
}

/** The sanitizer drops contenteditable on load, so headings are locked again after every render. */
function lockHeadings(el: HTMLElement) {
  el.querySelectorAll('h4.rte-section').forEach((h) => h.setAttribute('contenteditable', 'false'));
}

/**
 * True when nothing but the template's own headings (or nothing at all) has been written. Only a
 * heading that still reads exactly as the template wrote it is discounted: if text somehow ends up
 * inside a heading, that heading counts as content, so it is saved rather than silently dropped.
 */
function isTemplateOnly(el: HTMLElement) {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('h4.rte-section').forEach((h) => {
    if (SECTION_TITLES.has(h.textContent?.trim() ?? '')) h.remove();
  });
  return !copy.textContent?.trim();
}

/** The HTML to store: the editing-only contenteditable markers are not part of the description. */
function storedHtml(el: HTMLElement) {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
  return copy.innerHTML;
}

/** Descriptions saved before pictures were supported are plain text: turn them into HTML. */
export function toRichText(value: string | null | undefined): string {
  if (!value) return '';
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\r?\n/g, '<br>');
}

/**
 * Description editor: a strip of attachments on top, formatted text underneath. Pictures are
 * inlined as data URLs; videos are uploaded separately and referenced by id, so a large clip
 * never travels inside the ticket JSON.
 */
@Component({
  selector: 'app-rich-text',
  imports: [ImageViewer, Modal],
  template: `
    <div class="rte" [class.dragging]="dragging()"
      (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
      @if (!readonly()) {
      <div class="rte-toolbar" role="toolbar" aria-label="Description formatting">
        <button type="button" class="rte-btn" title="Bold (Ctrl+B)" aria-label="Bold" (mousedown)="$event.preventDefault()" (click)="format('bold')"><b>B</b></button>
        <button type="button" class="rte-btn" title="Italic (Ctrl+I)" aria-label="Italic" (mousedown)="$event.preventDefault()" (click)="format('italic')"><i>I</i></button>
        <button type="button" class="rte-btn" title="Bulleted list" (mousedown)="$event.preventDefault()" (click)="format('insertUnorderedList')">• List</button>
        <button type="button" class="rte-btn" title="Add the Actual Result / Expected Result / Steps to Reproduce sections"
          (mousedown)="$event.preventDefault()" (click)="insertTemplate()">📋 Template</button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" (mousedown)="$event.preventDefault()" (click)="picker.click()">🖼 Add picture</button>
        <input #picker type="file" accept="image/*" multiple hidden (change)="onPickPictures(picker)" />
        @if (projectId()) {
          <button type="button" class="rte-btn" [disabled]="uploading()"
            (mousedown)="$event.preventDefault()" (click)="videoPicker.click()">🎬 Add video</button>
          <input #videoPicker type="file" accept="video/*" multiple hidden (change)="onPickVideos(videoPicker)" />
        }
        <span class="rte-hint">
          @if (uploading()) { Uploading {{ uploading() }}… } @else { or paste / drag files in }
        </span>
      </div>
      }

      @if (media().length) {
        <div class="rte-pics" role="group" aria-label="Attachments">
          @for (item of media(); track item.key; let i = $index) {
            <figure class="rte-pic">
              @if (item.kind === 'picture') {
                <button type="button" class="rte-pic-open" (click)="viewing.set(item)"
                  [attr.aria-label]="'Enlarge ' + caption(item)" [title]="caption(item) || 'Click to enlarge'">
                  <img [src]="item.src" [alt]="caption(item)" loading="lazy" decoding="async" />
                </button>
              } @else {
                <button type="button" class="rte-pic-open rte-video-tile" (click)="playing.set(item)"
                  [attr.aria-label]="'Play ' + caption(item)" [title]="caption(item)">
                  <span class="rte-video-play" aria-hidden="true">▶</span>
                  <span class="rte-video-name">{{ item.name }}</span>
                </button>
              }
              @if (readonly()) {
                @if (item.title) { <figcaption class="rte-pic-caption">{{ item.title }}</figcaption> }
              } @else {
                <button type="button" class="rte-pic-remove" (click)="removeMedia(i)"
                  [attr.aria-label]="'Remove ' + caption(item)" title="Remove">×</button>
                <figcaption>
                  <input class="rte-pic-title" type="text" [value]="item.title" [attr.maxlength]="maxTitle"
                    placeholder="Add a title…" [attr.aria-label]="'Title for ' + caption(item)"
                    (change)="setTitle(i, $event)" />
                </figcaption>
              }
            </figure>
          }
        </div>
      }

      <div #editor class="rte-editor" [class.rte-editor-readonly]="readonly()"
        [attr.contenteditable]="readonly() ? 'false' : 'true'" role="textbox" aria-multiline="true"
        [attr.aria-readonly]="readonly()"
        [attr.id]="inputId() || null" [attr.aria-label]="label()" [attr.data-placeholder]="readonly() ? 'No description' : placeholder()"
        (input)="emit()" (focus)="onEditorFocus()" (blur)="saveSelection()" (keyup)="saveSelection()" (mouseup)="saveSelection()"
        (paste)="onPaste($event)"></div>
    </div>

    @if (viewing(); as item) {
      <app-image-viewer [src]="item.src" [alt]="caption(item)" (closed)="viewing.set(null)" />
    }

    @if (playing(); as item) {
      <app-modal [heading]="caption(item)" [wide]="true" (closed)="playing.set(null)">
        <video class="rte-video-player" [src]="videoUrl(item)" controls autoplay preload="metadata"></video>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="playing.set(null)">Close</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class RichText {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly value = model<string>('');
  readonly placeholder = input('');
  readonly label = input('Description');
  readonly inputId = input('');
  /** Videos upload against a project. Zero hides the video button (no project context yet). */
  readonly projectId = input(0);
  /** Viewers can open pictures and play videos but not change anything. */
  readonly readonly = input(false);

  readonly dragging = signal(false);
  readonly media = signal<Media[]>([]);
  readonly viewing = signal<Media | null>(null);
  readonly playing = signal<Media | null>(null);
  /** Name of the file currently uploading, or empty. */
  readonly uploading = signal('');

  readonly pictures = computed(() => this.media().filter((m) => m.kind === 'picture'));
  readonly maxTitle = MAX_TITLE_LENGTH;
  readonly caption = mediaLabel;

  private readonly editor = viewChild.required<ElementRef<HTMLDivElement>>('editor');
  private lastHtml: string | null = null;
  private savedRange: Range | null = null;

  constructor() {
    // Only re-render when the value changes from outside (load, discard), not while typing.
    effect(() => {
      const value = this.value();
      if (value === this.lastHtml) return;
      // Split first, sanitize second. Angular's allowlist has no data-* attributes, so sanitizing
      // up front would strip every attachment's id and title. Attachments are rendered through
      // Angular bindings instead, which sanitize per value.
      const { media, text } = split(toRichText(value));
      this.media.set(media);
      this.editor().nativeElement.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, text) ?? '';
      lockHeadings(this.editor().nativeElement);
      this.lastHtml = value;
      this.savedRange = null;
      untracked(() => this.syncTemplate());
    });
    // Access can arrive after the ticket (the project loads separately), so re-check when it flips.
    effect(() => {
      this.readonly();
      untracked(() => this.syncTemplate());
    });
  }

  /**
   * Empty and editable: lay out the sections to fill in. Read-only: an untouched template is just
   * empty headings, so show the "No description" state instead. Never emits, so merely opening a
   * ticket cannot mark it as changed.
   */
  private syncTemplate() {
    const el = this.editor().nativeElement;
    if (this.readonly()) {
      if (el.innerHTML && isTemplateOnly(el)) el.innerHTML = '';
    } else if (!el.textContent?.trim()) {
      el.innerHTML = templateHtml(TEMPLATE_SECTIONS);
    }
  }

  /**
   * Focusing an untouched template puts the caret under the first heading, so "click the box and
   * type" writes the Actual Result instead of text floating above every section.
   */
  onEditorFocus() {
    const el = this.editor().nativeElement;
    if (this.readonly() || !isTemplateOnly(el)) return;
    const first = el.querySelector('h4.rte-section');
    const body = first?.nextElementSibling;
    const target = body?.matches('ol, ul') ? body.querySelector('li') : body;
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /** Toolbar button: add whichever sections are missing, after anything already written. */
  insertTemplate() {
    const el = this.editor().nativeElement;
    const present = new Set(
      Array.from(el.querySelectorAll('h4.rte-section')).map((h) => h.textContent?.trim().toLowerCase()),
    );
    const missing = TEMPLATE_SECTIONS.filter((s) => !present.has(s.title.toLowerCase()));
    if (!missing.length) {
      this.toast.success('All description sections are already there.');
      return;
    }
    if (isTemplateOnly(el) && !el.querySelector('h4.rte-section')) el.innerHTML = '';
    el.insertAdjacentHTML('beforeend', templateHtml(missing));
    this.emit();
  }

  videoUrl(item: Media) {
    return this.api.attachmentUrl(item.attachmentId, this.auth.getToken());
  }

  format(command: string) {
    this.restoreSelection();
    document.execCommand(command);
    this.emit();
  }

  emit() {
    const el = this.editor().nativeElement;
    if (!el.textContent?.trim() && el.innerHTML) el.innerHTML = ''; // everything deleted: show the placeholder
    // Headings with nothing written under them are not a description.
    const blank = isTemplateOnly(el);
    const html = join(this.media(), blank ? '' : storedHtml(el));
    this.lastHtml = html;
    this.value.set(html);
  }

  /**
   * Commits on change (blur or Enter) rather than on every keystroke: emit() re-serialises every
   * data URL in the strip, which is megabytes of string work per character.
   */
  setTitle(index: number, event: Event) {
    const title = (event.target as HTMLInputElement).value.slice(0, MAX_TITLE_LENGTH);
    if (this.media()[index]?.title === title) return;
    this.media.update((list) => list.map((item, i) => (i === index ? { ...item, title } : item)));
    this.emit();
  }

  removeMedia(index: number) {
    this.viewing.set(null);
    this.playing.set(null);
    this.media.update((list) => list.filter((_, i) => i !== index));
    this.emit();
  }

  saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount && this.editor().nativeElement.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  onPickPictures(picker: HTMLInputElement) {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    this.addPictures(files);
  }

  onPickVideos(picker: HTMLInputElement) {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    this.addVideos(files);
  }

  onPaste(event: ClipboardEvent) {
    if (this.readonly()) {
      event.preventDefault();
      return;
    }
    const files = Array.from(event.clipboardData?.files ?? []);
    event.preventDefault();
    if (files.length) {
      this.addFiles(files);
    } else {
      // Paste as plain text so formatting and scripts from other pages don't come along.
      document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
    }
  }

  onDragOver(event: DragEvent) {
    if (this.readonly() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent) {
    this.dragging.set(false);
    if (this.readonly()) {
      event.preventDefault(); // otherwise the browser navigates to the dropped file
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    this.addFiles(files);
  }

  /** Sorts dropped or pasted files into the two paths and rejects anything else. */
  private addFiles(files: File[]) {
    const images = files.filter(isImage);
    const videos = files.filter(isVideo);
    if (images.length + videos.length < files.length) {
      this.toast.error('Only pictures and videos can be attached.');
    }
    if (images.length) this.addPictures(images);
    if (videos.length) this.addVideos(videos);
  }

  /** Pictures always go to the end of the strip, so there is no caret to worry about. */
  private async addPictures(files: File[]) {
    const images = files.filter(isImage);
    if (images.length < files.length) this.toast.error('Only picture files can be added.');

    const added: Media[] = [];
    for (const file of images) {
      let src: string;
      try {
        src = await shrink(file);
      } catch {
        this.toast.error(`Could not read the picture “${file.name}”.`);
        continue;
      }
      const next = pictureItem(src, file.name);
      if (join([...this.media(), ...added, next], this.editor().nativeElement.innerHTML).length > MAX_DESCRIPTION_LENGTH) {
        this.toast.error('The description is too large. Use fewer or smaller pictures.');
        break;
      }
      added.push(next);
    }

    if (!added.length) return;
    this.media.update((list) => [...list, ...added]);
    this.emit();
  }

  /**
   * Videos are uploaded to the API first and referenced by id, so the description stays small.
   * One at a time: these are large and a parallel burst helps nobody.
   */
  private async addVideos(files: File[]) {
    const projectId = this.projectId();
    if (!projectId) {
      this.toast.error('Save the ticket before attaching a video.');
      return;
    }

    const added: Media[] = [];
    for (const file of files.filter(isVideo)) {
      if (file.size > MAX_VIDEO_BYTES) {
        this.toast.error(`“${file.name}” is larger than ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`);
        continue;
      }
      this.uploading.set(file.name);
      try {
        const saved = await this.api.uploadAttachment(projectId, file);
        added.push(videoItem(saved.attachmentId, saved.fileName));
      } catch {
        // The error interceptor already surfaced the reason.
      } finally {
        this.uploading.set('');
      }
    }

    if (!added.length) return;
    this.media.update((list) => [...list, ...added]);
    this.emit();
  }

  /** Put the caret back where it was, or at the end of the editor. */
  private restoreSelection() {
    const el = this.editor().nativeElement;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    let range = this.savedRange;
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Splits stored HTML into its attachments and its text. Tickets saved before attachments had their
 * own section keep pictures inline, so every <img> is hoisted out wherever it sits — which upgrades
 * old descriptions on the spot, with no migration.
 */
function split(html: string): { media: Media[]; text: string } {
  // DOMParser builds an inert document: no scripts run and no resources load, so attributes can be
  // read off not-yet-sanitized HTML safely. Assigning to innerHTML here would start image loads and
  // fire any onerror handler hiding in the markup.
  const holder = new DOMParser().parseFromString(html, 'text/html').body;

  const found = Array.from(holder.querySelectorAll('img, video'));
  const media = found
    .map((el) => {
      const title = el.getAttribute('data-title') ?? '';
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src');
        return src ? pictureItem(src, el.getAttribute('alt') ?? '', title) : null;
      }
      const id = Number(el.getAttribute('data-attachment'));
      return id > 0 ? videoItem(id, el.getAttribute('data-name') || 'Video', title) : null;
    })
    .filter((item): item is Media => item !== null);

  found.forEach((el) => el.remove());
  holder.querySelectorAll('.rte-pics').forEach((el) => el.remove());
  return { media, text: holder.innerHTML.trim() };
}

/**
 * Videos are stored as an id, never a URL: the download URL carries a short-lived token that must
 * not be baked into the saved description.
 */
function join(media: Media[], text: string): string {
  if (!media.length) return text;
  const tags = media
    .map((m) => {
      // Only written when set, so untitled attachments round-trip byte-identical.
      const title = m.title.trim() ? ` data-title="${escapeAttr(m.title.trim())}"` : '';
      return m.kind === 'picture'
        ? `<img src="${escapeAttr(m.src)}" alt="${escapeAttr(m.name)}"${title}>`
        : `<video data-attachment="${m.attachmentId}" data-name="${escapeAttr(m.name)}"${title}></video>`;
    })
    .join('');
  return `<div class="rte-pics">${tags}</div>${text}`;
}

function isImage(file: File) {
  return file.type.startsWith('image/');
}

function isVideo(file: File) {
  return file.type.startsWith('video/');
}

function escapeAttr(text: string) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Never re-encode a picture into a bigger one: a small icon should stay as it arrived. */
function smallest(encoded: string, original: string) {
  return encoded.length < original.length ? encoded : original;
}

/**
 * Scale big pictures down to at most 1400px on the long side and re-encode them, so tickets stay
 * small. WebP is preferred: on UI screenshots it keeps text crisp at a fraction of PNG's size.
 * Browsers that cannot encode WebP quietly return a PNG from toDataURL, so check what came back.
 */
async function shrink(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif') return original; // keep the animation
  const img = await loadImage(original);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const webp = canvas.toDataURL('image/webp', IMAGE_QUALITY);
  if (webp.startsWith('data:image/webp')) return smallest(webp, original); // WebP keeps transparency

  ctx.globalCompositeOperation = 'destination-over'; // JPEG has no alpha: fill it white
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return smallest(canvas.toDataURL('image/jpeg', IMAGE_QUALITY), original);
}
