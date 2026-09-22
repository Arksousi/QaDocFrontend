import { Directive, ElementRef, HostListener, OnDestroy, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const MASK = '•';

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Phone-keyboard style password box: the character you just typed stays readable for a
 * moment, then collapses to a dot. Only ever one character is visible at a time.
 *
 * The box is a `text` input, so the browser would otherwise show everything — the real
 * password lives here and the element only ever holds the masked render. Edits are taken
 * over from `beforeinput` so the mask, the caret and the form value stay in step.
 *
 * Trade-off: because it is not a `type="password"` field, browsers and password managers
 * will not offer to save or autofill it.
 */
@Directive({
  selector: 'input[appPeekPassword]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeekPassword), multi: true }],
})
export class PeekPassword implements ControlValueAccessor, OnDestroy {
  /** How long a freshly typed character stays readable, in milliseconds. */
  readonly peekFor = input(600);

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private real = '';
  private shown = '';
  private peekAt = -1;
  private timer = 0;
  private onChange: (value: string) => void = () => {};
  private onTouched = () => {};

  constructor() {
    this.el.type = 'text';
    this.el.autocapitalize = 'off';
    this.el.spellcheck = false;
    this.el.setAttribute('autocorrect', 'off');
  }

  @HostListener('beforeinput', ['$event'])
  protected onBeforeInput(e: InputEvent) {
    let start = this.el.selectionStart ?? this.real.length;
    let end = this.el.selectionEnd ?? start;

    if (e.inputType.startsWith('insert')) {
      // Composition (IME) can't be driven from here; onInput reconciles those instead.
      if (e.inputType === 'insertCompositionText') return;
      // Enter in a single-line box means "submit the form", and some browsers announce it here
      // as insertLineBreak. Cancelling it would swallow the keystroke and the form would never
      // submit — left alone, the browser's implicit submission does its job.
      if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') return;
      e.preventDefault();
      const text = e.data ?? e.dataTransfer?.getData('text') ?? '';
      this.splice(start, end, text.replace(/[\r\n]/g, ''));
    } else if (e.inputType.startsWith('delete')) {
      e.preventDefault();
      // Word- and line-wise deletes are treated as single characters: predictable, and
      // there are no word boundaries to see in a field of dots anyway.
      if (start === end) {
        if (e.inputType.includes('Forward')) end = Math.min(this.real.length, start + 1);
        else start = Math.max(0, start - 1);
      }
      this.splice(start, end, '');
    } else if (e.inputType.startsWith('history')) {
      // Undo would restore a mask, not a password.
      e.preventDefault();
    }
  }

  /** Catches edits that never reached onBeforeInput: IME composition, autofill, extensions. */
  @HostListener('input')
  protected onInput() {
    if (this.el.value === this.shown) return;
    const now = this.el.value;
    let head = 0;
    while (head < this.shown.length && head < now.length && this.shown[head] === now[head]) head++;
    let tail = 0;
    while (
      tail < this.shown.length - head &&
      tail < now.length - head &&
      this.shown[this.shown.length - 1 - tail] === now[now.length - 1 - tail]
    ) {
      tail++;
    }
    const inserted = now.slice(head, now.length - tail);
    this.splice(head, this.shown.length - tail, inserted);
  }

  @HostListener('blur')
  @HostListener('window:blur')
  protected onBlur() {
    this.onTouched();
    this.hidePeek();
  }

  writeValue(value: string | null) {
    this.real = value ?? '';
    this.peekAt = -1;
    this.render();
  }

  registerOnChange(fn: (value: string) => void) {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean) {
    this.el.disabled = disabled;
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  private splice(start: number, end: number, text: string) {
    this.real = this.real.slice(0, start) + text + this.real.slice(end);
    const caret = start + text.length;

    clearTimeout(this.timer);
    // Peek the last character of whatever was just inserted; a delete reveals nothing.
    this.peekAt = text ? caret - 1 : -1;
    if (this.peekAt >= 0) this.timer = setTimeout(() => this.hidePeek(), this.peekFor());

    this.render(caret);
    this.onChange(this.real);
  }

  private hidePeek() {
    clearTimeout(this.timer);
    if (this.peekAt < 0) return;
    this.peekAt = -1;
    this.render();
  }

  /** Writes the masked value back to the element, keeping the caret where the user left it. */
  private render(caret?: number) {
    const from = caret ?? this.el.selectionStart ?? this.real.length;
    const to = caret ?? this.el.selectionEnd ?? from;
    // Split by code unit, not code point, so mask length matches the caret indices the
    // element reports. A peeked astral character reveals both halves of its pair.
    const pairStart = this.peekAt > 0 && isLowSurrogate(this.real.charCodeAt(this.peekAt)) ? this.peekAt - 1 : this.peekAt;
    this.shown = this.real
      .split('')
      .map((c, i) => (i >= pairStart && i <= this.peekAt ? c : MASK))
      .join('');
    this.el.value = this.shown;
    if (document.activeElement === this.el) this.el.setSelectionRange(from, to);
  }
}
