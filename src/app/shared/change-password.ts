import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';
import { PeekPassword } from './peek-password';

@Component({
  selector: 'app-change-password',
  imports: [FormsModule, Modal, PeekPassword],
  template: `
    <app-modal heading="Change password" (closed)="closed.emit()">
      <form id="changePasswordForm" class="form" (ngSubmit)="save()">
        <label>Current password
          <input name="current" appPeekPassword [(ngModel)]="current" required autocomplete="current-password" autofocus />
        </label>
        <label>New password <small class="muted">at least 8 characters</small>
          <input name="next" appPeekPassword [(ngModel)]="next" required minlength="8" autocomplete="new-password" />
        </label>
        <label>Confirm new password
          <input name="confirm" appPeekPassword [(ngModel)]="confirm" required autocomplete="new-password" />
        </label>
        @if (confirm && next !== confirm) { <p class="field-error">Passwords do not match.</p> }
        <p class="muted small">Other browsers where you are signed in will be signed out.</p>
      </form>
      <ng-container modal-actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" type="submit" form="changePasswordForm"
          [disabled]="busy() || !current || next.length < 8 || next !== confirm">Change password</button>
      </ng-container>
    </app-modal>
  `,
})
export class ChangePassword {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly closed = output<void>();
  readonly busy = signal(false);

  current = '';
  next = '';
  confirm = '';

  async save() {
    if (this.busy() || this.next !== this.confirm) return;
    this.busy.set(true);
    try {
      await this.auth.changePassword(this.current, this.next);
      this.toast.success('Password changed.');
      this.closed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
