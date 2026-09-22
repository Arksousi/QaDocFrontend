import { Component, HostListener, input, output } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-modal',
  imports: [Icon],
  template: `
    <div class="modal-backdrop" (mousedown)="onBackdrop($event)">
      <div class="modal" [class.modal-wide]="wide()" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
        <header class="modal-header">
          <h2>{{ heading() }}</h2>
          <button class="icon-btn" (click)="closed.emit()" aria-label="Close"><app-icon name="close" /></button>
        </header>
        <div class="modal-body"><ng-content /></div>
        <footer class="modal-footer"><ng-content select="[modal-actions]" /></footer>
      </div>
    </div>
  `,
})
export class Modal {
  readonly heading = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
