import { Component, computed, input } from '@angular/core';
import { TicketType } from '../core/models';

/**
 * The little glyph that marks a ticket as a Bug or an Enhancement. Drawn inline rather than as an
 * emoji so it takes the theme colour and stays crisp at any zoom.
 */
@Component({
  selector: 'app-type-icon',
  template: `
    @if (type() === 'Enhancement') {
      <svg class="type-icon type-enhancement" viewBox="0 0 16 16" role="img" [attr.aria-label]="label()">
        <title>{{ label() }}</title>
        <!-- Glass, then the screw base, then three rays: the rays are what make it read as a
             bulb rather than a blob at 15px. -->
        <path d="M8 2.6a4 4 0 0 1 2.5 7.1c-.4.4-.6.8-.6 1.3H6.1c0-.5-.2-.9-.6-1.3A4 4 0 0 1 8 2.6z" fill="currentColor" />
        <path d="M6.3 12.2h3.4M6.9 13.7h2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none" />
        <path d="M8 .9v.9M13.4 3.3l-.7.6M2.6 3.3l.7.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" />
      </svg>
    } @else {
      <!-- Head, body and three legs a side. Legs stay horizontal and clear of the body: radiating
           them evenly turns the whole glyph into a starburst at 15px. -->
      <svg class="type-icon type-bug" viewBox="0 0 16 16" role="img" [attr.aria-label]="label()">
        <title>{{ label() }}</title>
        <path d="M6.4 3.1 5.4 1.9M9.6 3.1l1-1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" />
        <circle cx="8" cy="4.4" r="1.7" fill="currentColor" />
        <path d="M4.6 7.1H2.4M4.6 9.4H2.4M4.6 11.7H2.4M11.4 7.1h2.2M11.4 9.4h2.2M11.4 11.7h2.2"
          stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" />
        <rect x="4.9" y="6.1" width="6.2" height="8" rx="3.1" fill="currentColor" />
      </svg>
    }
  `,
})
export class TypeIcon {
  readonly type = input.required<TicketType>();
  /** Screen readers and the hover tooltip both read this. */
  readonly label = computed(() => this.type());
}
