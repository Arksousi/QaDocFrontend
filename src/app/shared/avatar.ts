import { Component, computed, inject, input } from '@angular/core';
import { AvatarService } from '../core/avatar.service';
import { avatarTone, initials } from '../core/models';
import { UserCardTrigger } from './user-card';

/** sm 22px (lists), md 30px (comments, menus), lg 40px, xl 112px (the Profile page). */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Someone's face: their profile picture when they have one, otherwise their initials on their own
 * colour — the same everywhere, so a person is recognisable at a glance in any list.
 *
 * The host takes no box of its own (display: contents), so the circle sits in a row exactly where
 * the old hand-written <span class="avatar"> did, and every `.x .avatar-sm` sizing rule still applies.
 * Decorative: the name always sits beside it, so it is hidden from screen readers.
 */
@Component({
  selector: 'app-avatar',
  imports: [UserCardTrigger],
  host: { style: 'display: contents' },
  template: `
    @if (src(); as url) {
      <img class="avatar avatar-img {{ sizeClass() }}" [src]="url" alt="" aria-hidden="true" [appUserCard]="cardId()" />
    } @else {
      <span class="avatar {{ sizeClass() }} avatar-t{{ tone() }}" aria-hidden="true" [appUserCard]="cardId()">{{ letters() }}</span>
    }
  `,
})
export class Avatar {
  private readonly avatars = inject(AvatarService);

  readonly userId = input<number | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input<AvatarSize>('md');
  /** Whether hovering opens the user card (Admins and Leaders only see it anyway). */
  readonly card = input(true);

  readonly src = computed(() => this.avatars.src(this.userId()));
  readonly tone = computed(() => avatarTone(this.name() ?? ''));
  readonly letters = computed(() => initials(this.name() ?? ''));
  readonly sizeClass = computed(() => ({ sm: 'avatar-sm', md: '', lg: 'avatar-lg', xl: 'avatar-xl' })[this.size()]);
  readonly cardId = computed(() => (this.card() ? this.userId() ?? null : null));
}
