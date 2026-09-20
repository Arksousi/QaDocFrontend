import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { IMPACTS, PRIORITIES, STATES, SaveTicket, Suggestions, TICKET_TYPES, Ticket, UserOption, initials, slug } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';
import { RichText, toRichText } from './rich-text';
import { TagInput } from './tag-input';

/** Ticket Details window: an editable Details box, then Comments and History tabs. */
@Component({
  selector: 'app-ticket-details',
  imports: [FormsModule, DatePipe, Modal, TagInput, RichText],
  template: `
    <app-modal [heading]="ticket() ? ticket()!.ticketKey + ' · ' + ticket()!.title : 'Ticket'" [wide]="true" (closed)="close()">
      @if (ticket(); as t) {
        <section class="details-box" aria-label="Details">
          <h3 class="box-title">Details</h3>
          <form id="ticketDetailsForm" class="details-grid" (ngSubmit)="save()">
            <div class="detail">
              <span class="detail-label">Activity Date</span>
              <span class="detail-value">{{ t.activityDate | date: 'MMMM d, y, h:mm a' }}</span>
            </div>

            <label class="detail span-2">
              <span class="detail-label">Title *</span>
              <input name="title" [(ngModel)]="form.title" required maxlength="200" [readonly]="!canEdit()" (ngModelChange)="touch()" />
            </label>

            <label class="detail">
              <span class="detail-label">Type</span>
              <select name="ticketType" [(ngModel)]="form.ticketType" [disabled]="!canEdit()" (ngModelChange)="touch()">
                @for (tt of types; track tt) { <option [value]="tt">{{ tt }}</option> }
              </select>
            </label>
            <div class="detail">
              <span class="detail-label">Assigned By</span>
              <span class="detail-value">
                @if (t.assignedByName) { {{ t.assignedByName }} } @else { <span class="muted">—</span> }
              </span>
            </div>

            <label class="detail">
              <span class="detail-label">Assigned To</span>
              <select name="assignedTo" [(ngModel)]="form.assignedToUserId" [disabled]="!canEdit()" (ngModelChange)="touch()">
                <option [ngValue]="null">Unassigned</option>
                @for (u of assigneeOptions(); track u.userId) { <option [ngValue]="u.userId">{{ u.displayName }}</option> }
              </select>
            </label>
            <label class="detail">
              <span class="detail-label">State</span>
              <select name="state" [(ngModel)]="form.state" [disabled]="!canEdit()" (ngModelChange)="touch()" class="state-select">
                @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </label>
            <label class="detail">
              <span class="detail-label">Priority</span>
              <select name="priority" [(ngModel)]="form.priority" [disabled]="!canEdit()" (ngModelChange)="touch()">
                @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.value }}</option> }
              </select>
            </label>
            <label class="detail">
              <span class="detail-label">Impact</span>
              <select name="impact" [(ngModel)]="form.impact" [disabled]="!canEdit()" (ngModelChange)="touch()">
                @for (i of impacts; track i) { <option [value]="i">{{ i }}</option> }
              </select>
            </label>

            <div class="detail span-2">
              <label class="detail-label" for="details-tags">Tag</label>
              <app-tag-input inputId="details-tags" [readonly]="!canEdit()" [tags]="form.tags" (tagsChange)="form.tags = $event; touch()" [suggestions]="suggestions().tags" />
            </div>

            <div class="detail span-2">
              <span class="detail-label">Description</span>
              <app-rich-text [value]="form.description" (valueChange)="form.description = $event; touch()"
                [projectId]="t.projectId" [readonly]="!canEdit()"
                placeholder="Describe the issue, or press 📋 Template. Paste screenshots or videos here." />
            </div>
          </form>
          <p class="muted small audit">
            Created by {{ t.createdByName ?? 'unknown' }} on {{ t.createdAt | date: 'MMMM d, y, h:mm a' }}
            @if (t.updatedByName) { · Last updated by {{ t.updatedByName }} }
          </p>
          <div class="box-actions">
            @if (auth.isAdmin()) {
              <button type="button" class="btn btn-ghost danger" (click)="remove()">Delete ticket</button>
            }
            <span class="grow"></span>
            @if (canEdit()) {
              @if (dirty()) {
                <span class="muted small">Unsaved changes</span>
                <button type="button" class="btn btn-ghost" (click)="reset()">Discard</button>
              }
              <button type="submit" form="ticketDetailsForm" class="btn btn-primary" [disabled]="!dirty() || saving() || !form.title.trim()">Save changes</button>
            } @else {
              <span class="muted small">You have read-only access to this project. You can still comment.</span>
            }
          </div>
        </section>

        <div class="tabs" role="tablist">
          <button role="tab" [attr.aria-selected]="tab() === 'comments'" [class.active]="tab() === 'comments'" (click)="tab.set('comments')">
            Comments <span class="count">{{ t.comments.length }}</span>
          </button>
          <button role="tab" [attr.aria-selected]="tab() === 'history'" [class.active]="tab() === 'history'" (click)="tab.set('history')">
            History <span class="count">{{ t.history.length }}</span>
          </button>
        </div>

        @if (tab() === 'comments') {
          <section class="comments" role="tabpanel" aria-label="Comments">
            @for (c of t.comments; track c.commentId) {
              <article class="comment">
                <span class="avatar" aria-hidden="true">{{ initialsOf(c.authorName) }}</span>
                <div class="grow">
                  <header class="comment-head">
                    <strong>{{ c.authorName }}</strong>
                    <time class="muted small" [attr.datetime]="c.createdAt">{{ c.createdAt | date: 'MMMM d, y, h:mm a' }}</time>
                  </header>
                  <p class="prose">{{ c.text }}</p>
                </div>
              </article>
            } @empty {
              <p class="muted small">No comments yet.</p>
            }

            <form class="comment-form" (ngSubmit)="postComment()">
              <div class="comment-compose">
                <span class="avatar" aria-hidden="true">{{ initialsOf(auth.user()?.displayName) }}</span>
                <textarea name="text" rows="3" [(ngModel)]="commentText" placeholder="Add a comment…" aria-label="Comment text"
                  (keydown.control.enter)="postComment()"></textarea>
              </div>
              <div class="comment-form-row">
                <span class="muted small">Posting as {{ auth.user()?.displayName }} · Ctrl+Enter to post</span>
                <button type="submit" class="btn btn-primary push-left" [disabled]="posting() || !commentText.trim()">Comment</button>
              </div>
            </form>
          </section>
        } @else {
          <section class="history" role="tabpanel" aria-label="History">
            @for (h of t.history; track h.historyId) {
              <div class="history-row">
                <span class="avatar avatar-sm" aria-hidden="true">{{ initialsOf(h.userName) }}</span>
                <div class="grow">
                  @if (h.field === 'Created') {
                    <strong>{{ h.userName }}</strong> created the ticket
                  } @else if (h.field === 'Description') {
                    <strong>{{ h.userName }}</strong> changed <strong>Description</strong>
                  } @else {
                    <strong>{{ h.userName }}</strong> changed <strong>{{ h.field }}</strong>
                    <span class="change">
                      <span class="old">{{ h.oldValue || '(empty)' }}</span>
                      <span aria-hidden="true">→</span><span class="sr-only">to</span>
                      <span class="new">{{ h.newValue || '(empty)' }}</span>
                    </span>
                  }
                </div>
                <time class="muted small nowrap" [attr.datetime]="h.changedAt">{{ h.changedAt | date: 'MMM d, h:mm a' }}</time>
              </div>
            } @empty {
              <p class="muted small">No changes recorded.</p>
            }
          </section>
        }
      } @else if (notFound()) {
        <p class="muted">This ticket was not found. It may have been deleted.</p>
      } @else {
        <p class="muted">Loading…</p>
      }
      <ng-container modal-actions>
        <button class="btn btn-ghost" (click)="close()">Close</button>
      </ng-container>
    </app-modal>
  `,
})
export class TicketDetails {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly ticketId = input.required<number>();
  readonly suggestions = input<Suggestions>({ tags: [] });
  readonly users = input<UserOption[]>([]);
  /** False for project Viewers: the API refuses their saves, so do not offer them. */
  readonly canEdit = input(true);
  /** Emitted after a save, comment or delete so the list can refresh. */
  readonly changed = output<void>();
  readonly closed = output<void>();

  readonly ticket = signal<Ticket | null>(null);
  readonly notFound = signal(false);
  readonly saving = signal(false);
  readonly posting = signal(false);
  readonly tab = signal<'comments' | 'history'>('comments');
  private readonly version = signal(0);

  readonly states = STATES;
  readonly priorities = PRIORITIES;
  readonly impacts = IMPACTS;
  readonly types = TICKET_TYPES;
  readonly slugOf = slug;
  readonly initialsOf = initials;

  form: SaveTicket = emptyForm();
  commentText = '';

  /** Re-evaluated whenever a field changes (touch bumps the version signal). */
  readonly dirty = computed(() => {
    this.version();
    const t = this.ticket();
    return !!t && JSON.stringify(toForm(t)) !== JSON.stringify(normalise(this.form));
  });

  /** Active users, plus the current assignee even if they have since been deactivated. */
  readonly assigneeOptions = computed(() => {
    const t = this.ticket();
    const list = this.users();
    if (t?.assignedToUserId && !list.some((u) => u.userId === t.assignedToUserId)) {
      return [...list, { userId: t.assignedToUserId, displayName: `${t.assignedToName} (inactive)`, username: '' }];
    }
    return list;
  });

  constructor() {
    effect(async () => {
      const id = this.ticketId();
      this.ticket.set(null);
      this.notFound.set(false);
      try {
        this.load(await this.api.ticket(id));
      } catch {
        this.notFound.set(true);
      }
    });
  }

  touch() {
    this.version.update((v) => v + 1);
  }

  reset() {
    const t = this.ticket();
    if (t) this.load(t);
  }

  close() {
    if (this.dirty() && !confirm('Discard unsaved changes to this ticket?')) return;
    this.closed.emit();
  }

  async save() {
    const t = this.ticket();
    if (!t || !this.form.title.trim() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.api.updateTicket(t.ticketId, normalise(this.form));
      this.load(await this.api.ticket(t.ticketId));
      this.toast.success(`${t.ticketKey} saved.`);
      this.changed.emit();
    } finally {
      this.saving.set(false);
    }
  }

  async postComment() {
    const t = this.ticket();
    const text = this.commentText.trim();
    if (!t || !text || this.posting()) return;
    this.posting.set(true);
    try {
      const comment = await this.api.addComment(t.ticketId, text);
      this.commentText = '';
      // Keep unsaved Details edits; only append the comment and refresh the activity date.
      this.ticket.set({ ...t, comments: [...t.comments, comment], commentCount: t.commentCount + 1, activityDate: comment.createdAt });
      this.changed.emit();
    } finally {
      this.posting.set(false);
    }
  }

  async remove() {
    const t = this.ticket();
    if (!t || !confirm(`Delete ${t.ticketKey} “${t.title}” with its comments and history? This cannot be undone.`)) return;
    await this.api.deleteTicket(t.ticketId);
    this.toast.success(`${t.ticketKey} deleted.`);
    this.changed.emit();
    this.closed.emit();
  }

  private load(t: Ticket) {
    this.ticket.set(t);
    this.form = toForm(t);
    this.touch();
  }
}

function emptyForm(): SaveTicket {
  return { folderId: 0, title: '', description: '', ticketType: 'Bug', assignedToUserId: null, state: 'Open', priority: 3, impact: 'Medium', tags: [] };
}

function toForm(t: Ticket): SaveTicket {
  return normalise({
    folderId: t.folderId,
    title: t.title,
    ticketType: t.ticketType,
    description: toRichText(t.description),
    assignedToUserId: t.assignedToUserId,
    state: t.state,
    priority: t.priority,
    impact: t.impact,
    tags: [...t.tags],
  });
}

/** Same shape the server stores, so "dirty" ignores whitespace-only differences. */
function normalise(f: SaveTicket): SaveTicket {
  return {
    folderId: f.folderId,
    title: f.title.trim(),
    ticketType: f.ticketType,
    description: (f.description ?? '').trimEnd(),
    assignedToUserId: f.assignedToUserId ?? null,
    state: f.state,
    priority: Number(f.priority),
    impact: f.impact,
    tags: [...f.tags],
  };
}
