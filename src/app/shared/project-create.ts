import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';

/** The "Add project" dialog, shared by the Project Menu and the Leader Dashboard. Opens the new project on success. */
@Component({
  selector: 'app-project-create',
  imports: [FormsModule, Modal],
  template: `
    <app-modal heading="Add project" (closed)="closed.emit()">
      <form id="addProjectForm" class="form" (ngSubmit)="save()">
        <label>Name *
          <input name="name" [(ngModel)]="newName" required maxlength="150" autofocus
            placeholder="e.g. Restaurant Management System" (ngModelChange)="suggestCode()" />
        </label>
        <label>Code *
          <input name="code" [(ngModel)]="newCode" required maxlength="10" placeholder="e.g. RMS"
            (ngModelChange)="newCode = $event.toUpperCase(); codeTouched = true" />
          <span class="hint">Starts every ticket key in this project, e.g. <span class="mono">{{ keyExample() }}</span></span>
        </label>
      </form>
      <ng-container modal-actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" type="submit" form="addProjectForm" [disabled]="saving() || !newName.trim() || !newCode.trim()">Add project</button>
      </ng-container>
    </app-modal>
  `,
})
export class ProjectCreate {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly closed = output<void>();
  readonly saving = signal(false);
  newName = '';
  newCode = '';
  /** Stops the suggestion overwriting a code the user typed themselves. */
  codeTouched = false;

  /**
   * Offers a code as the name is typed: initials for multi-word names ("Restaurant Management
   * System" → RMS), the first letters otherwise. Mirrors what the migration does to old projects.
   */
  suggestCode() {
    if (this.codeTouched) return;
    const words = this.newName.trim().split(/\s+/).filter(Boolean);
    const derived =
      words.length > 1
        ? words.map((w) => w[0]).join('')
        : (words[0] ?? '').slice(0, 4);
    this.newCode = derived.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
  }

  keyExample() {
    return `${this.newCode || 'RMS'}-V1-0001`;
  }

  async save() {
    const name = this.newName.trim();
    const code = this.newCode.trim().toUpperCase();
    if (!name || !code || this.saving()) return;
    this.saving.set(true);
    try {
      const { id } = await this.api.createProject(name, code);
      this.toast.success(`Project “${name}” (${code}) created.`);
      this.router.navigate(['/projects', id]);
    } finally {
      this.saving.set(false);
    }
  }
}
