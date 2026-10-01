import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';
import { UserOption, avatarTone, initials, loadLabel } from '../core/models';
import { Icon } from './icon';
import { Avatar } from './avatar';

/**
 * The app's "are you sure?" dialog, rendered once in the app root and driven by ConfirmService.
 * It sits above every other dialog, so it can ask on behalf of the ticket window.
 *
 * Focus starts on the safe choice when the action destroys something (Cancel), and on the action
 * otherwise, so Enter does the expected thing either way. Esc always cancels.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Avatar, Icon],
  template: `
    @if (confirm.request(); as r) {
      <div class="modal-backdrop confirm-backdrop" (mousedown)="onBackdrop($event)">
        <div class="modal confirm-dialog confirm-{{ r.tone }}" role="alertdialog" aria-modal="true"
          aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <div class="confirm-body">
            <span class="confirm-mark" aria-hidden="true">
              <app-icon [name]="r.tone === 'primary' ? 'check' : 'alert'" />
            </span>
            <div class="confirm-text">
              <h2 id="confirm-title">{{ r.title }}</h2>
              <p id="confirm-message">{{ r.message }}</p>
              @if (r.person; as u) {
                <div class="confirm-person">
                  <app-avatar size="sm" [userId]="u.userId" [name]="u.displayName" [card]="false" />
                  <span class="confirm-person-name">{{ u.displayName }}</span>
                  <span class="picker-load picker-load-full">
                    @if (u.ticketLimit != null) {
                      <span class="picker-bar" aria-hidden="true"><span [style.width.%]="pct(u)"></span></span>
                    }
                    <span class="picker-count">{{ load(u) }}</span>
                  </span>
                </div>
              }
            </div>
          </div>
          <footer class="modal-footer">
            <button #cancel type="button" class="btn btn-ghost" (click)="confirm.resolve(false)">Cancel</button>
            <button #ok type="button" class="btn" [class.btn-danger]="r.tone === 'danger'" [class.btn-primary]="r.tone !== 'danger'"
              (click)="confirm.resolve(true)">{{ r.confirmLabel }}</button>
          </footer>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  protected readonly toneOf = avatarTone;
  protected readonly initialsOf = initials;

  private readonly cancel = viewChild<ElementRef<HTMLButtonElement>>('cancel');
  private readonly ok = viewChild<ElementRef<HTMLButtonElement>>('ok');

  constructor() {
    // Whatever had focus (the Save button, a folder's delete icon) gets it back when the dialog closes.
    let returnTo: HTMLElement | null = null;
    effect(() => {
      const r = this.confirm.request();
      if (r) {
        returnTo ??= document.activeElement as HTMLElement | null;
        const target = r.tone === 'danger' ? this.cancel() : this.ok();
        target?.nativeElement.focus();
      } else if (returnTo) {
        returnTo.focus?.();
        returnTo = null;
      }
    });
  }

  protected pct(u: UserOption) {
    return u.ticketLimit ? Math.min(100, Math.round((u.openTickets / u.ticketLimit) * 100)) : 0;
  }

  protected load(u: UserOption) {
    return loadLabel(u.openTickets, u.ticketLimit);
  }

  // The key press that asked (Esc on a ticket with unsaved changes) must not also answer. One that
  // answers stops there: this dialog is created first, so the ticket window behind it would
  // otherwise hear the same Esc a moment later and ask all over again.
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event) {
    if (!this.confirm.request() || event.timeStamp < this.confirm.openedAt) return;
    event.stopImmediatePropagation();
    this.confirm.resolve(false);
  }

  protected onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.confirm.resolve(false);
  }
}
