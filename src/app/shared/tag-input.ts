import { Component, input, model, signal } from '@angular/core';

/** Chip-style editor for free-text tags. Enter or comma adds a tag; Backspace on an empty box removes the last one. */
@Component({
  selector: 'app-tag-input',
  template: `
    <div class="tag-input" (click)="box.focus()">
      @for (tag of tags(); track tag) {
        <span class="tag">
          {{ tag }}
          <button type="button" class="tag-remove" (click)="remove(tag); $event.stopPropagation()" [attr.aria-label]="'Remove tag ' + tag">×</button>
        </span>
      }
      <input #box [id]="inputId()" [attr.list]="listId" [value]="draft()" (input)="onInput(box.value)"
        (keydown.enter)="$event.preventDefault(); commit()" (keydown.backspace)="onBackspace()" (blur)="commit()"
        [placeholder]="tags().length ? '' : 'Add tags…'" maxlength="50" autocomplete="off" />
      <datalist [id]="listId">
        @for (s of suggestions(); track s) {
          <option [value]="s"></option>
        }
      </datalist>
    </div>
  `,
})
export class TagInput {
  readonly tags = model<string[]>([]);
  readonly suggestions = input<string[]>([]);
  readonly inputId = input<string>('');
  readonly draft = signal('');
  readonly listId = `tag-suggestions-${Math.random().toString(36).slice(2, 8)}`;

  onInput(value: string) {
    // Typing (or pasting) a comma commits everything before it.
    if (value.includes(',')) {
      const parts = value.split(',');
      this.draft.set(parts.pop() ?? '');
      parts.forEach((p) => this.add(p));
    } else {
      this.draft.set(value);
    }
  }

  commit() {
    this.add(this.draft());
    this.draft.set('');
  }

  onBackspace() {
    if (!this.draft() && this.tags().length) this.tags.update((list) => list.slice(0, -1));
  }

  remove(tag: string) {
    this.tags.update((list) => list.filter((t) => t !== tag));
  }

  private add(raw: string) {
    const tag = raw.trim().slice(0, 50);
    if (!tag || this.tags().some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    this.tags.update((list) => [...list, tag]);
  }
}
