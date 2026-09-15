import { Component, ElementRef, SecurityContext, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ToastService } from '../core/toast.service';

/** Largest description the API accepts (pictures are stored inline as data URLs). */
export const MAX_DESCRIPTION_LENGTH = 15_000_000;
const MAX_IMAGE_SIDE = 1600;

/** Descriptions saved before pictures were supported are plain text: turn them into HTML. */
export function toRichText(value: string | null | undefined): string {
  if (!value) return '';
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\r?\n/g, '<br>');
}

/** Description editor: basic formatting plus pictures (button, paste or drag and drop). */
@Component({
  selector: 'app-rich-text',
  template: `
    <div class="rte" [class.dragging]="dragging()">
      <div class="rte-toolbar" role="toolbar" aria-label="Description formatting">
        <button type="button" class="rte-btn" title="Bold (Ctrl+B)" aria-label="Bold" (mousedown)="$event.preventDefault()" (click)="format('bold')"><b>B</b></button>
        <button type="button" class="rte-btn" title="Italic (Ctrl+I)" aria-label="Italic" (mousedown)="$event.preventDefault()" (click)="format('italic')"><i>I</i></button>
        <button type="button" class="rte-btn" title="Bulleted list" (mousedown)="$event.preventDefault()" (click)="format('insertUnorderedList')">• List</button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" (mousedown)="$event.preventDefault()" (click)="picker.click()">🖼 Add picture</button>
        <input #picker type="file" accept="image/*" multiple hidden (change)="onPick(picker)" />
        <span class="rte-hint">or paste / drag pictures in</span>
      </div>
      <div #editor class="rte-editor" contenteditable="true" role="textbox" aria-multiline="true"
        [attr.id]="inputId() || null" [attr.aria-label]="label()" [attr.data-placeholder]="placeholder()"
        (input)="emit()" (blur)="saveSelection()" (keyup)="saveSelection()" (mouseup)="saveSelection()"
        (paste)="onPaste($event)" (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)"></div>
    </div>
  `,
})
export class RichText {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);

  readonly value = model<string>('');
  readonly placeholder = input('');
  readonly label = input('Description');
  readonly inputId = input('');
  readonly dragging = signal(false);

  private readonly editor = viewChild.required<ElementRef<HTMLDivElement>>('editor');
  private lastHtml: string | null = null;
  private savedRange: Range | null = null;

  constructor() {
    // Only re-render when the value changes from outside (load, discard), not while typing.
    effect(() => {
      const value = this.value();
      if (value === this.lastHtml) return;
      this.editor().nativeElement.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, toRichText(value)) ?? '';
      this.lastHtml = value;
      this.savedRange = null;
    });
  }

  format(command: string) {
    this.restoreSelection();
    document.execCommand(command);
    this.emit();
  }

  emit() {
    const el = this.editor().nativeElement;
    const blank = !el.textContent?.trim() && !el.querySelector('img');
    if (blank && el.innerHTML) el.innerHTML = ''; // lets the placeholder show again
    const html = blank ? '' : el.innerHTML;
    this.lastHtml = html;
    this.value.set(html);
  }

  saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount && this.editor().nativeElement.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  onPick(picker: HTMLInputElement) {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    this.insertImages(files);
  }

  onPaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []).filter(isImage);
    event.preventDefault();
    if (files.length) {
      this.saveSelection();
      this.insertImages(files);
    } else {
      // Paste as plain text so formatting and scripts from other pages don't come along.
      document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
    }
  }

  onDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent) {
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter(isImage);
    if (!files.length) return;
    event.preventDefault();
    this.savedRange = caretAt(event.clientX, event.clientY) ?? this.savedRange;
    this.insertImages(files);
  }

  private async insertImages(files: File[]) {
    const images = files.filter(isImage);
    if (images.length < files.length) this.toast.error('Only picture files can be added.');
    for (const file of images) {
      let src: string;
      try {
        src = await shrink(file);
      } catch {
        this.toast.error(`Could not read the picture “${file.name}”.`);
        continue;
      }
      if (this.editor().nativeElement.innerHTML.length + src.length > MAX_DESCRIPTION_LENGTH) {
        this.toast.error('The description is too large. Use fewer or smaller pictures.');
        break;
      }
      this.restoreSelection();
      document.execCommand('insertHTML', false, `<img src="${src}" alt="${escapeAttr(file.name)}"><br>`);
      this.saveSelection();
    }
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

function isImage(file: File) {
  return file.type.startsWith('image/');
}

function escapeAttr(text: string) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function caretAt(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
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

/** Scale big pictures down to at most 1600px on the long side so tickets stay small. */
async function shrink(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return original; // keep animation / vectors
  const img = await loadImage(original);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size <= 300_000) return original;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (file.type === 'image/png') {
    const png = canvas.toDataURL('image/png'); // screenshots stay sharp when PNG is small enough
    if (png.length <= 1_500_000) return png;
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
