import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Icon],
  template: `
    <router-outlet />
    <div class="toasts" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast toast-{{ t.kind }}" role="status">
          <!-- The dot is the only thing saying which kind this is, so it is labelled rather than
               hidden: the message text alone does not always make a failure obvious. -->
          <span class="toast-dot">
            <app-icon [name]="t.kind === 'success' ? 'check' : 'alert'" [label]="t.kind === 'success' ? 'Success' : 'Error'" />
          </span>
          <p>{{ t.message }}</p>
          <button class="icon-btn" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">
            <app-icon name="close" />
          </button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
