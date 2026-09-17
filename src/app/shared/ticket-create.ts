import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { IMPACTS, PRIORITIES, STATES, SaveTicket, Suggestions, UserOption } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';
import { RichText } from './rich-text';
import { TagInput } from './tag-input';

/** Ticket creation window. */
@Component({
  selector: 'app-ticket-create',
  imports: [FormsModule, Modal, TagInput, RichText],
  template: `
    <app-modal heading="Create ticket" [wide]="true" (closed)="closed.emit()">
      <form id="createTicketForm" class="form" (ngSubmit)="save()">
        <label>Title *
          <input name="title" [(ngModel)]="draft.title" required maxlength="200" autofocus placeholder="Short summary of the issue or task" />
        </label>
        <div class="form-grid">
          <label>Assigned To
            <select name="assignedTo" [(ngModel)]="draft.assignedToUserId">
              <option [ngValue]="null">Unassigned</option>
              @for (u of users(); track u.userId) { <option [ngValue]="u.userId">{{ u.displayName }}</option> }
            </select>
          </label>
          <label>State
            <select name="state" [(ngModel)]="draft.state">
              @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </label>
          <label>Priority
            <select name="priority" [(ngModel)]="draft.priority">
              @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.value }}</option> }
            </select>
          </label>
          <label>Impact
            <select name="impact" [(ngModel)]="draft.impact">
              @for (i of impacts; track i) { <option [value]="i">{{ i }}</option> }
            </select>
          </label>
        </div>
        <div class="field">
          <label for="create-tags">Tag</label>
          <app-tag-input inputId="create-tags" [(tags)]="draft.tags" [suggestions]="suggestions().tags" />
          <span class="hint">Press Enter or comma to add a tag.</span>
        </div>
        <div class="field">
          <span class="field-label">Description</span>
          <app-rich-text [(value)]="draft.description" [projectId]="projectId()"
            placeholder="Describe the issue, or press 📋 Template. Paste screenshots or videos here." />
        </div>
      </form>
      <ng-container modal-actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" type="submit" form="createTicketForm" [disabled]="saving() || !draft.title.trim()">Create ticket</button>
      </ng-container>
    </app-modal>
  `,
})
export class TicketCreate {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<number>();
  /** Which folder the ticket is filed into; it decides the key, e.g. RMS-V1-0001. */
  readonly folderId = input.required<number>();
  readonly suggestions = input<Suggestions>({ tags: [] });
  readonly users = input<UserOption[]>([]);
  readonly created = output<number>();
  readonly closed = output<void>();
  readonly saving = signal(false);

  readonly states = STATES;
  readonly priorities = PRIORITIES;
  readonly impacts = IMPACTS;

  draft: SaveTicket = { folderId: 0, title: '', description: '', assignedToUserId: null, state: 'Open', priority: 3, impact: 'Medium', tags: [] };

  async save() {
    if (!this.draft.title.trim() || this.saving()) return;
    this.saving.set(true);
    try {
      const { id } = await this.api.createTicket({ ...this.draft, title: this.draft.title.trim(), folderId: this.folderId() });
      this.toast.success('Ticket created.');
      this.created.emit(id);
    } finally {
      this.saving.set(false);
    }
  }
}
