import { Component, computed, input } from '@angular/core';
import { TicketType } from '../core/models';

/**
 * The little glyph that marks a ticket as a Bug, an Enhancement or an Issue. Drawn inline rather
 * than as an emoji so it takes the theme colour and stays crisp at any zoom. In the ticket list it
 * stands alone with no wording beside it, so each shape has to be distinct at 15px and the
 * aria-label and <title> carry the name for screen readers and the hover tooltip.
 */
@Component({
  selector: 'app-type-icon',
  template: `
    @if (type() === 'Issue') {
      <!-- A warning triangle: no curves at all, so it cannot be mistaken for the round-bodied bug
           or the bulb at a glance. Left open rather than filled to keep it lighter than the bug. -->
      <svg class="type-icon type-issue" viewBox="0 0 16 16" role="img" [attr.aria-label]="label()">
        <title>{{ label() }}</title>
        <path d="M8 2.2 14.6 13.4H1.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none" />
        <path d="M8 6.4v3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" />
        <circle cx="8" cy="11.5" r="0.85" fill="currentColor" />
      </svg>
    } @else if (type() === 'Enhancement') {
      <svg class="type-icon type-enhancement" viewBox="0 0 16 16" role="img" [attr.aria-label]="label()">
        <title>{{ label() }}</title>
        <!-- Glass, then the screw base, then three rays: the rays are what make it read as a
             bulb rather than a blob at 15px. -->
        <path d="M8 2.6a4 4 0 0 1 2.5 7.1c-.4.4-.6.8-.6 1.3H6.1c0-.5-.2-.9-.6-1.3A4 4 0 0 1 8 2.6z" fill="currentColor" />
        <path d="M6.3 12.2h3.4M6.9 13.7h2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none" />
        <path d="M8 .9v.9M13.4 3.3l-.7.6M2.6 3.3l.7.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" />
      </svg>
    } @else {
      <!-- A beetle seen from above: antennae, head, a rounded shell split down the middle, and
           three stubby legs a side. The body is deliberately large and the legs short: longer,
           thinner legs turn the whole glyph into a starburst at 15px. The wing split is painted
           over the fill in white rather than cut out of it, so it shows on any row colour. -->
      <svg class="type-icon type-bug" viewBox="0 0 16 16" role="img" [attr.aria-label]="label()">
        <title>{{ label() }}</title>
        <path d="M6.4 2.5 5.5 1.2M9.6 2.5l.9-1.3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" fill="none" />
        <path d="M3.9 7.2 2.2 6.4M3.5 10.1H1.8M3.9 13l-1.7.8M12.1 7.2l1.7-.8M12.5 10.1h1.7M12.1 13l1.7.8"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />
        <circle cx="8" cy="4.6" r="2.1" fill="currentColor" />
        <ellipse cx="8" cy="10" rx="4.9" ry="5" fill="currentColor" />
        <path d="M8 6v8.6" stroke="#fff" stroke-opacity=".92" stroke-width="1.15" stroke-linecap="round" fill="none" />
      </svg>
    }
  `,
})
export class TypeIcon {
  readonly type = input.required<TicketType>();
  /** Screen readers and the hover tooltip both read this. */
  readonly label = computed(() => this.type());
}
