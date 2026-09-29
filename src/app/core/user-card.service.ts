import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserCard } from './models';

/** Long enough that sweeping the mouse down a column of avatars does not fire a card for each. */
const OPEN_DELAY_MS = 350;
/** Long enough to move from the avatar onto the card without it vanishing in between. */
const CLOSE_DELAY_MS = 200;
/** A card is reused for this long; a load that changes in the meantime shows on the next hover. */
const CACHE_MS = 60_000;

export interface OpenCard {
  userId: number;
  /** Where the avatar is on screen, to place the card beside it. */
  anchor: DOMRect;
  card: UserCard | null;
  failed: boolean;
}

/**
 * The one hover card the whole app shares. Avatars ask for it through the UserCardTrigger
 * directive; App renders it once. Only Admins and Leaders ever get one — the API refuses
 * everyone else, and this does not ask on their behalf.
 */
@Injectable({ providedIn: 'root' })
export class UserCardService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly open = signal<OpenCard | null>(null);
  private readonly cache = new Map<number, { card: UserCard; at: number }>();
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;

  /** Called when the pointer rests on an avatar. */
  hoverStart(userId: number, element: HTMLElement) {
    if (!this.auth.canLead()) return;
    clearTimeout(this.closeTimer);
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => this.show(userId, element.getBoundingClientRect()), OPEN_DELAY_MS);
  }

  /** Called when the pointer leaves an avatar or the card. */
  hoverEnd() {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.open.set(null), CLOSE_DELAY_MS);
  }

  /** The pointer reached the card itself: keep it. */
  keep() {
    clearTimeout(this.closeTimer);
  }

  close() {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.open.set(null);
  }

  private async show(userId: number, anchor: DOMRect) {
    const cached = this.cache.get(userId);
    const fresh = cached && Date.now() - cached.at < CACHE_MS ? cached.card : null;
    this.open.set({ userId, anchor, card: fresh, failed: false });
    if (fresh) return;

    try {
      const card = await this.api.userCard(userId);
      this.cache.set(userId, { card, at: Date.now() });
      // Only fill it in if they are still looking at the same person.
      if (this.open()?.userId === userId) this.open.update((o) => (o ? { ...o, card } : o));
    } catch {
      if (this.open()?.userId === userId) this.open.update((o) => (o ? { ...o, failed: true } : o));
    }
  }
}
