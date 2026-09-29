import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../core/models';
import { NotificationService } from '../core/notification.service';
import { Icon } from './icon';

/** The top bar's bell: tickets someone else assigned to you. Opening a row opens that ticket. */
@Component({
  selector: 'app-notification-bell',
  imports: [DatePipe, Icon],
  template: `
    <div class="bell-menu">
      <button class="icon-btn bell-button" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="menu"
        [attr.aria-label]="notes.unread() ? notes.unread() + ' unread notifications' : 'Notifications'">
        <app-icon name="bell" />
        @if (notes.unread()) {
          <span class="bell-badge" aria-hidden="true">{{ notes.unread() > 9 ? '9+' : notes.unread() }}</span>
        }
      </button>
      @if (open()) {
        <div class="menu bell-panel" role="menu">
          <div class="bell-head">
            <strong>Notifications</strong>
            @if (notes.unread()) {
              <button class="link-btn small" (click)="notes.markAllRead()">Mark all read</button>
            }
          </div>
          @for (n of notes.items(); track n.notificationId) {
            <button role="menuitem" class="bell-item" [class.unread]="!n.isRead" (click)="openTicket(n)">
              <span class="bell-text">
                @if (n.kind === 'Mentioned') {
                  <strong>{{ n.actorName ?? 'Someone' }}</strong> mentioned you on <span class="mono">{{ n.ticketKey }}</span>
                } @else {
                  <strong>{{ n.actorName ?? 'Someone' }}</strong> assigned <span class="mono">{{ n.ticketKey }}</span> to you
                }
              </span>
              <span class="bell-title">{{ n.title }}</span>
              <span class="muted small">{{ n.createdAt | date: 'MMM d, h:mm a' }}</span>
            </button>
          } @empty {
            <p class="muted small bell-empty">{{ loading() ? 'Loading…' : 'Nothing yet. Tickets assigned to you, and comments that mention you, show up here.' }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationBell {
  protected readonly notes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);
  readonly loading = signal(false);

  async toggle() {
    this.open.set(!this.open());
    if (!this.open()) return;
    this.loading.set(true);
    try {
      await this.notes.loadItems();
    } finally {
      this.loading.set(false);
    }
  }

  /** The ticket viewer opens ?ticket=<id> as the ticket window, so the link lands on the ticket itself. */
  async openTicket(n: AppNotification) {
    this.open.set(false);
    this.router.navigate(['/projects', n.projectId], { queryParams: { ticket: n.ticketId } });
    await this.notes.markRead(n);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.open.set(false);
  }
}
