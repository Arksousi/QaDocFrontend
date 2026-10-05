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
  | 'tag'
  | 'bell'
  | 'user'
  | 'lock'
  | 'priority-1'
  | 'priority-2'
  | 'priority-3'
  | 'priority-4'
  | 'folder'
  | 'chart'
  | 'users'
  | 'shield'
  | 'logout'
  | 'apps'
  | 'testcase'
  | 'share';

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
        @case ('bell') {
          <path d="M4 11.2V7.2a4 4 0 0 1 8 0v4l1.2 1.3H2.8z" />
          <path d="M6.6 14a1.5 1.5 0 0 0 2.8 0" />
        }
        @case ('user') { <circle cx="8" cy="5.4" r="2.6" /><path d="M3 13.6c.6-2.5 2.6-3.9 5-3.9s4.4 1.4 5 3.9" /> }
        @case ('lock') { <rect x="3.3" y="7" width="9.4" height="6.6" rx="1.4" /><path d="M5.5 7V5.1a2.5 2.5 0 0 1 5 0V7" /> }
        @case ('priority-1') {
          <!-- Priority, most to least urgent: two chevrons up, one up, a level bar, one down. -->
          <path d="M4 8.6 8 4.8l4 3.8M4 12.2 8 8.4l4 3.8" stroke-width="1.8" /> }
        @case ('priority-2') { <path d="M4 10.2 8 6.4l4 3.8" stroke-width="1.8" /> }
        @case ('priority-3') { <path d="M4 6.6h8M4 9.8h8" stroke-width="1.8" /> }
        @case ('priority-4') { <path d="M4 6.2 8 10l4-3.8" stroke-width="1.8" /> }
        @case ('folder') { <path d="M2 4.6a1 1 0 0 1 1-1h3.1l1.4 1.5H13a1 1 0 0 1 1 1v6.3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /> }
        @case ('chart') { <path d="M2 13.5h12M4 11.5V8M8 11.5V4M12 11.5V6.5" /> }
        @case ('users') { <circle cx="6" cy="5.6" r="2.3" /><path d="M1.8 13.2c.5-2.2 2.2-3.5 4.2-3.5s3.7 1.3 4.2 3.5M10.6 3.6a2.1 2.1 0 0 1 0 4.1M11.7 9.9c1.3.4 2.2 1.5 2.5 3.1" /> }
        @case ('shield') { <path d="M8 1.8 13 3.7v3.9c0 3-2.1 5.3-5 6.6-2.9-1.3-5-3.6-5-6.6V3.7z" /><path d="M5.9 8.1 7.4 9.6l2.8-2.8" /> }
        @case ('logout') { <path d="M6.5 2.5h-3v11h3M10.2 5l3 3-3 3M13.2 8H6.4" /> }
        @case ('apps') {
          <!-- The launcher: four tiles, the shape an "all apps" grid has everywhere. -->
          <rect x="2.3" y="2.3" width="4.8" height="4.8" rx="1.1" />
          <rect x="8.9" y="2.3" width="4.8" height="4.8" rx="1.1" />
          <rect x="2.3" y="8.9" width="4.8" height="4.8" rx="1.1" />
          <rect x="8.9" y="8.9" width="4.8" height="4.8" rx="1.1" />
        }
        @case ('testcase') {
          <!-- A clipboard with a tick: a test case somebody has run. -->
          <rect x="3" y="2.6" width="10" height="11.2" rx="1.6" />
          <path d="M6.1 2.6V4h3.8V2.6" />
          <path d="M5.6 8.7 7.2 10.3l3.2-3.4" />
        }
        @case ('share') {
          <path d="M4 12v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1M8 2v8M5 5l3-3 3 3" />
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
