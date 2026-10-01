import { Injectable, signal } from '@angular/core';
import { UserOption } from './models';

/** What the confirm button means: removing something, a warning you may override, or a plain yes. */
export type ConfirmTone = 'danger' | 'warning' | 'primary';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** The confirm button's words, saying what happens: "Delete ticket", not "OK". */
  confirmLabel: string;
  tone?: ConfirmTone;
  /** Shown as a card under the message: the person an "assign anyway?" question is about. */
  person?: UserOption;
}

/**
 * The app's own "are you sure?", in place of the browser's confirm(): styled like the rest of the
 * app, with a button that says what it does. One question at a time; a second ask while one is
 * open answers the first with "no" rather than stacking dialogs.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  /** When the open question was asked, on the same clock as Event.timeStamp. */
  openedAt = 0;
  private resolver: ((ok: boolean) => void) | null = null;

  ask(request: ConfirmRequest): Promise<boolean> {
    this.resolve(false);
    this.openedAt = performance.now();
    this.request.set({ tone: 'primary', ...request });
    return new Promise((resolve) => (this.resolver = resolve));
  }

  resolve(ok: boolean) {
    const done = this.resolver;
    this.resolver = null;
    this.request.set(null);
    done?.(ok);
  }
}
