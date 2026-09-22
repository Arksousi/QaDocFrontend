import { Component, input } from '@angular/core';

/** Every glyph this app draws. Adding one means adding a case below — there is no dynamic lookup. */
export type IconName =
  | 'more'
  | 'caret'
  | 'sort-asc'
  | 'sort-desc'
  | 'close'
  | 'back'
  | 'arrow-right'
  | 'comment'
  | 'template'
  | 'picture'
  | 'video'
  | 'play'
  | 'check'
  | 'alert'
  | 'zoom-in'
  | 'zoom-out'
  | 'bullets'
  | 'plus'
  | 'search'
  | 'tag';

/**
 * The line-icon family, drawn inline for the same reason `TypeIcon` is: an emoji picks up whatever
 * the operating system ships, so `⋯` `▾` `×` `💬` each rendered at a different weight, baseline and
 * colour on every machine, and none of them took the theme. These are one stroke weight (1.5 at
 * 16px), all `currentColor`, so a row of controls finally reads as one set.
 *
 * Decorative by default — the button around an icon carries the `aria-label`. Pass a `label` only
 * when the glyph is the whole message, as the toast status dot is.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg class="icon" [class]="'icon-' + name()" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      [attr.role]="label() ? 'img' : 'presentation'"
      [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'">
      @if (label()) { <title>{{ label() }}</title> }

      @switch (name()) {
        @case ('more') {
          <!-- Dots are the one shape here that must not be stroked: at 1.5 weight a 0.9r circle
               fills in anyway, and an outlined dot reads as a ring. -->
          <circle cx="3.2" cy="8" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="12.8" cy="8" r="1.25" fill="currentColor" stroke="none" />
        }
        @case ('caret') { <path d="M4.2 6.3 8 10.1l3.8-3.8" /> }
        @case ('sort-asc') { <path d="M4.2 9.7 8 5.9l3.8 3.8" /> }
        @case ('sort-desc') { <path d="M4.2 6.3 8 10.1l3.8-3.8" /> }
        @case ('close') { <path d="M4 4l8 8M12 4l-8 8" /> }
        @case ('back') { <path d="M9.8 3.5 5.3 8l4.5 4.5" /> }
        @case ('arrow-right') { <path d="M2.5 8h11M9.5 4l4 4-4 4" /> }
        @case ('comment') {
          <!-- Tail on the lower left, so the bubble still reads as speech when it sits inline
               after a title rather than alone. -->
          <path d="M13.5 9.4a1.6 1.6 0 0 1-1.6 1.6H5.6L2.5 13.7V4.1a1.6 1.6 0 0 1 1.6-1.6h7.8a1.6 1.6 0 0 1 1.6 1.6z" />
        }
        @case ('template') {
          <rect x="3" y="2.2" width="10" height="11.6" rx="1.5" />
          <path d="M5.6 5.6h4.8M5.6 8h4.8M5.6 10.4h2.8" />
        }
        @case ('picture') {
          <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.5" />
          <circle cx="5.8" cy="6.5" r="1.05" />
          <!-- The hill runs off the right edge of the frame: a fully enclosed triangle reads as a
               play button at 16px. -->
          <path d="M2.8 11.4 6.2 8.3l2.5 2.3 2.1-1.9 2.4 2.2" />
        }
        @case ('video') {
          <rect x="1.8" y="3.8" width="9" height="8.4" rx="1.5" />
          <path d="M10.8 8.6l3.4 2.4V5l-3.4 2.4z" />
        }
        @case ('play') { <path d="M5.4 3.4 12.4 8l-7 4.6z" stroke-width="1.4" /> }
        @case ('check') { <path d="M3.4 8.4 6.5 11.5 12.6 5" stroke-width="1.9" /> }
        @case ('alert') { <path d="M8 3.6v4.8" stroke-width="1.9" /><circle cx="8" cy="11.7" r="1" fill="currentColor" stroke="none" /> }
        @case ('zoom-in') { <path d="M8 3.4v9.2M3.4 8h9.2" /> }
        @case ('zoom-out') { <path d="M3.4 8h9.2" /> }
        @case ('bullets') {
          <path d="M6.2 4.3h7.3M6.2 8h7.3M6.2 11.7h7.3" />
          <circle cx="3" cy="4.3" r=".95" fill="currentColor" stroke="none" />
          <circle cx="3" cy="8" r=".95" fill="currentColor" stroke="none" />
          <circle cx="3" cy="11.7" r=".95" fill="currentColor" stroke="none" />
        }
        @case ('plus') { <path d="M8 3.4v9.2M3.4 8h9.2" /> }
        @case ('search') { <circle cx="7.1" cy="7.1" r="4.1" /><path d="M10.2 10.2l3 3" /> }
        @case ('tag') {
          <path d="M7.7 2.2H2.2v5.5l6.1 6.1a1.4 1.4 0 0 0 2 0l3.5-3.5a1.4 1.4 0 0 0 0-2z" />
          <circle cx="5.1" cy="5.1" r="1.05" fill="currentColor" stroke="none" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  /** Only when the glyph itself is the message; otherwise the surrounding button names the action. */
  readonly label = input('');
}
