import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AppNotification } from './models';

/** How often the unread count is refreshed while someone is signed in. */
const POLL_MS = 60_000;

/**
 * The bell's state. Polls only the unread count, which is one small query; the list itself is
 * fetched when the bell is opened. Runs only for a real signed-in account — a guest has nobody
 * assigning them anything — and stops the moment they sign out.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly unread = signal(0);
  readonly items = signal<AppNotification[]>([]);
  private timer?: ReturnType<typeof setInterval>;
  /** Coming back to the tab is when someone is most likely to look, so refresh then too. */
  private readonly onFocus = () => this.refreshCount();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      this.stop();
      if (user && !user.isGuest) this.start();
    });
  }

  async refreshCount() {
    try {
      this.unread.set((await this.api.unreadCount()).count);
    } catch {
      // Quiet by design: a missed poll is retried on the next tick.
    }
  }

  async loadItems() {
    this.items.set(await this.api.notifications());
  }

  /** Marks one read locally at once, so the badge drops as the click lands rather than after a round trip. */
  async markRead(n: AppNotification) {
    if (n.isRead) return;
    this.items.update((list) => list.map((x) => (x.notificationId === n.notificationId ? { ...x, isRead: true } : x)));
    this.unread.update((c) => Math.max(0, c - 1));
    await this.api.markNotificationRead(n.notificationId);
  }

  async markAllRead() {
    this.items.update((list) => list.map((x) => ({ ...x, isRead: true })));
    this.unread.set(0);
    await this.api.markAllNotificationsRead();
  }

  private start() {
    this.refreshCount();
    this.timer = setInterval(() => this.refreshCount(), POLL_MS);
    window.addEventListener('focus', this.onFocus);
  }

  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    window.removeEventListener('focus', this.onFocus);
    this.unread.set(0);
    this.items.set([]);
  }
}
