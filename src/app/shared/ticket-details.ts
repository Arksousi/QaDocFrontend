import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { IMPACTS, PRIORITIES, STATES, SaveTicket, Suggestions, TICKET_TYPES, Ticket, TicketComment, UserOption, avatarTone, initials, mentionSegments, slug } from '../core/models';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { AssigneePicker, confirmOverLimit, newlyOverLimit } from './assignee-picker';
import { StateGraph } from './state-graph';
import { Icon } from './icon';
import { Modal } from './modal';
import { RichText, toRichText } from './rich-text';
import { TagInput } from './tag-input';
import { Avatar } from './avatar';

/** Ticket Details window: an editable Details box, then Comments and History tabs. */
@Component({
  selector: 'app-ticket-details',
  imports: [Avatar, FormsModule, DatePipe, Modal, TagInput, RichText, Icon, AssigneePicker, StateGraph],
  template: `
    <app-modal [heading]="ticket() ? ticket()!.ticketKey + ' · ' + ticket()!.title : 'Ticket'" [wide]="true" (closed)="close()">
      @if (ticket(); as t) {
        <section class="details-box" aria-label="Details">
          <h3 class="box-title">Details</h3>
          <form id="ticketDetailsForm" class="details-grid" (ngSubmit)="save()">
            <!-- Three columns: Type / Assigned To / Assigned By, then State / Priority / Impact, then Tag
                 across two with the read-only Activity Date under the other read-only value. -->
            <label class="detail span-all">
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
              <span class="detail-label">Assigned To</span>
              <app-assignee-picker label="Assigned To" [readonly]="!canEdit()"
                [members]="users()" [outsiders]="outsiders()" [current]="t.assignees"
                [selected]="form.assignedToUserIds" (selectedChange)="form.assignedToUserIds = $event; touch()" />
              @if (joining().length) {
                <span class="hint">Saving adds {{ joinedNames() }} to this project as {{ joining().length === 1 ? 'a Contributor' : 'Contributors' }}.</span>
              }
            </div>
            <div class="detail">
              <span class="detail-label">Assigned By</span>
              <span class="detail-value">
                @if (assignedBy(); as by) {
                  <app-avatar size="sm" [userId]="by.userId" [name]="by.name" />
                  <span class="detail-value-text">{{ by.name }}</span>
                } @else {
                  <span class="muted">—</span>
                }
              </span>
            </div>

            <label class="detail">
              <span class="detail-label">State</span>
              <select name="state" [(ngModel)]="form.state" [disabled]="!canEdit()" (ngModelChange)="touch()"
                class="state-select state-text-{{ slugOf(form.state) }}">
                @for (s of states; track s) { <option [value]="s" class="state-text-{{ slugOf(s) }}">{{ s }}</option> }
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
            <div class="detail">
              <span class="detail-label">Activity Date</span>
              <span class="detail-value">{{ t.activityDate | date: 'MMMM d, y, h:mm a' }}</span>
            </div>

            <div class="detail span-all">
              <span class="detail-label">State Graph</span>
              <app-state-graph [ticket]="t" />
            </div>

            <div class="detail span-all">
              <span class="detail-label">Description</span>
              <app-rich-text [value]="form.description" (valueChange)="form.description = $event; touch()"
                [projectId]="t.projectId" [readonly]="!canEdit()"
                placeholder="Describe the issue, or press Template. Paste screenshots or videos here." />
            </div>
          </form>
          <p class="muted small audit">
            Created by {{ t.createdByName ?? 'unknown' }} on {{ t.createdAt | date: 'MMMM d, y, h:mm a' }}
            @if (t.updatedByName) { · Last updated by {{ t.updatedByName }} }
          </p>
          <!-- Saving lives in the modal footer, beside Close, so it is reachable without
               scrolling back up. What is left here is deletion and the read-only notes. -->
          @if (auth.isAdmin() || !canEdit()) {
            <div class="box-actions">
              @if (auth.isAdmin()) {
                <button type="button" class="btn btn-ghost danger" (click)="remove()">Delete ticket</button>
              }
              <span class="grow"></span>
              @if (!canEdit()) {
                @if (auth.isGuest()) {
                  <span class="muted small">This is sample data. Sign in to your own workspace to file tickets.</span>
                } @else {
                  <span class="muted small">You have read-only access to this project. You can still comment.</span>
                }
              }
            </div>
          }
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
                <app-avatar [userId]="c.authorUserId" [name]="c.authorName" />
                <div class="grow">
                  <header class="comment-head">
                    <strong>{{ c.authorName }}</strong>
                    <time class="muted small" [attr.datetime]="c.createdAt">{{ c.createdAt | date: 'MMMM d, y, h:mm a' }}</time>
                  </header>
                  <!-- On one line: .prose keeps whitespace, so any line break here would show. -->
                  <p class="prose">@for (seg of segmentsOf(c); track $index) {@if (seg.mention) {<span class="mention">{{ seg.text }}</span>} @else {{{ seg.text }}}}</p>
                </div>
              </article>
            } @empty {
              <p class="muted small">No comments yet.</p>
            }

            @if (!auth.isGuest()) {
            <form class="comment-form" (ngSubmit)="postComment()">
              <div class="comment-compose">
                <app-avatar [userId]="auth.user()?.userId" [name]="auth.user()?.displayName" />
                <div class="mention-wrap grow">
                  <textarea name="text" rows="3" [(ngModel)]="commentText" placeholder="Add a comment… Type @ to mention someone" aria-label="Comment text"
                    aria-autocomplete="list" [attr.aria-expanded]="mentionOptions().length > 0"
                    (keydown.control.enter)="postComment()" (input)="onCommentInput($event)" (keydown)="onCommentKeydown($event)"
                    (blur)="mentionQuery.set(null)"></textarea>
                  @if (mentionOptions().length) {
                    <div class="menu mention-menu" role="listbox" aria-label="People to mention">
                      @for (u of mentionOptions(); track u.userId; let i = $index) {
                        <!-- mousedown, not click: click would blur the textarea first and close this list. -->
                        <button type="button" role="option" [class.active]="i === mentionIndex()" [attr.aria-selected]="i === mentionIndex()"
                          (mousedown)="$event.preventDefault(); pickMention(u)">
                          <app-avatar size="sm" [userId]="u.userId" [name]="u.displayName" [card]="false" />
                          {{ u.displayName }} <span class="muted small">{{ '@' + u.username }}</span>
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
              <div class="comment-form-row">
                <span class="muted small">Posting as {{ auth.user()?.displayName }} · @ to mention · Ctrl+Enter to post</span>
                <button type="submit" class="btn btn-primary push-left" [disabled]="posting() || !commentText.trim()">Comment</button>
              </div>
            </form>
            }
          </section>
        } @else {
          <section class="history" role="tabpanel" aria-label="History">
            @for (h of t.history; track h.historyId) {
              <div class="history-row">
                <app-avatar size="sm" [userId]="h.userId" [name]="h.userName" />
                <div class="grow">
                  @if (h.field === 'Created') {
                    <strong>{{ h.userName }}</strong> created the ticket
                  } @else if (h.field === 'Description') {
                    <strong>{{ h.userName }}</strong> changed <strong>Description</strong>
                  } @else {
                    <strong>{{ h.userName }}</strong> changed <strong>{{ h.field }}</strong>
                    <span class="change">
                      <span class="old">{{ h.oldValue || '(empty)' }}</span>
                      <app-icon name="arrow-right" /><span class="sr-only">to</span>
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
        <!-- Edited: the only two choices are to keep the work or throw it away. Untouched:
             there is nothing to decide, so just a way out. The header × and Escape still work
             either way, and both ask first while there are unsaved changes. -->
        @if (canEdit() && dirty()) {
          <span class="muted small footer-note">Unsaved changes</span>
          <button type="button" class="btn btn-ghost" (click)="reset()">Discard</button>
          <!-- Outside the <form>, tied to it by id: the HTML form attribute submits it from here. -->
          <button type="submit" form="ticketDetailsForm" class="btn btn-primary"
            [disabled]="saving() || !form.title.trim()">Save changes</button>
        } @else {
          <button class="btn btn-ghost" (click)="close()">Close</button>
        }
      </ng-container>
    </app-modal>
  `,
})
export class TicketDetails {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly auth = inject(AuthService);

  readonly ticketId = input.required<number>();
  readonly suggestions = input<Suggestions>({ tags: [] });
  readonly users = input<UserOption[]>([]);
  /** People not yet assignable; only filled for those who manage the project. Picking one adds them. */
  readonly outsiders = input<UserOption[]>([]);
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
  readonly toneOf = avatarTone;

  form: SaveTicket = emptyForm();
  commentText = '';

  // ---------- @mentions ----------
  /** What follows the "@" being typed, or null when no mention is in progress. */
  readonly mentionQuery = signal<string | null>(null);
  readonly mentionIndex = signal(0);
  /** Where that "@" sits in the text, so picking a name replaces exactly the part typed. */
  private mentionStart = -1;
  private commentBox?: HTMLTextAreaElement;
  /** People picked so far, by id. Sent only if their "@Name" is still in the text when posting. */
  private readonly picked = new Map<number, string>();

  /** Who can be mentioned: the project's Contributors (and Admins), as for Assigned To — not yourself. */
  readonly mentionOptions = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const me = this.auth.user()?.userId;
    const needle = q.toLowerCase();
    return this.users().filter((u) => u.userId !== me && u.displayName.toLowerCase().includes(needle)).slice(0, 6);
  });

  segmentsOf(c: TicketComment) {
    return mentionSegments(c.text, c.mentions ?? []);
  }

  onCommentInput(event: Event) {
    const box = (this.commentBox = event.target as HTMLTextAreaElement);
    const before = box.value.slice(0, box.selectionStart ?? box.value.length);
    // An "@" at the start or after a space, then up to a few words with no newline: "@Moh", "@Mohammad N".
    const match = /(?:^|\s)@([^@\n]{0,40})$/.exec(before);
    if (!match) {
      this.mentionQuery.set(null);
      return;
    }
    this.mentionStart = before.length - match[1].length - 1;
    this.mentionQuery.set(match[1]);
    this.mentionIndex.set(0);
  }

  onCommentKeydown(event: KeyboardEvent) {
    this.commentBox = event.target as HTMLTextAreaElement;
    const options = this.mentionOptions();
    if (!options.length || event.ctrlKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.mentionIndex.set((this.mentionIndex() + step + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.pickMention(options[this.mentionIndex()]);
    } else if (event.key === 'Escape') {
      // Close the list, not the ticket window underneath it.
      event.preventDefault();
      event.stopPropagation();
      this.mentionQuery.set(null);
    }
  }

  pickMention(u: UserOption) {
    const box = this.commentBox;
    if (!box || this.mentionStart < 0) return;
    const caret = box.selectionStart ?? this.commentText.length;
    const insert = `@${u.displayName} `;
    this.commentText = this.commentText.slice(0, this.mentionStart) + insert + this.commentText.slice(caret);
    this.picked.set(u.userId, u.displayName);
    this.mentionQuery.set(null);
    const at = this.mentionStart + insert.length;
    // After the new text has rendered into the box, put the caret just past the name.
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(at, at);
    });
  }

  /** Re-evaluated whenever a field changes (touch bumps the version signal). */
  readonly dirty = computed(() => {
    this.version();
    const t = this.ticket();
    return !!t && JSON.stringify(toForm(t)) !== JSON.stringify(normalise(this.form));
  });

  /** Who put the assignee on this ticket, with their id so their picture shows. One owner per ticket, so one assigner. */
  readonly assignedBy = computed(() => {
    const a = (this.ticket()?.assignees ?? []).find((x) => x.assignedByName);
    return a ? { name: a.assignedByName!, userId: a.assignedByUserId ?? null } : null;
  });

  /** Outsiders the unsaved form assigns to: saving will make them Contributors. */
  readonly joining = computed(() => {
    this.version();
    return this.outsiders().filter((u) => this.form.assignedToUserIds.includes(u.userId));
  });
  readonly joinedNames = computed(() => this.joining().map((u) => u.displayName).join(', '));

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

  async close() {
    if (this.dirty() && !(await this.confirm.ask({
      title: 'Discard changes?',
      message: 'Your edits to this ticket have not been saved.',
      confirmLabel: 'Discard changes',
      tone: 'danger',
    }))) return;
    this.closed.emit();
  }

  async save() {
    const t = this.ticket();
    if (!t || !this.form.title.trim() || this.saving()) return;
    // A guide, not a rule: the API would accept it. Declining keeps the window open, unsaved.
    const over = newlyOverLimit([...this.users(), ...this.outsiders()], this.form.assignedToUserIds, t.assignees.map((a) => a.userId));
    if (!(await confirmOverLimit(this.confirm, over))) return;
    const joined = this.joinedNames();
    this.saving.set(true);
    try {
      await this.api.updateTicket(t.ticketId, normalise(this.form));
      this.load(await this.api.ticket(t.ticketId));
      this.toast.success(joined
        ? `${t.ticketKey} saved. Added to this project as Contributor: ${joined}.`
        : `${t.ticketKey} saved.`);
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
      // A name picked and then deleted from the text is not a mention any more.
      const mentioned = [...this.picked].filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id);
      const comment = await this.api.addComment(t.ticketId, text, mentioned);
      this.commentText = '';
      this.picked.clear();
      // Keep unsaved Details edits; only append the comment and refresh the activity date.
      this.ticket.set({ ...t, comments: [...t.comments, comment], commentCount: t.commentCount + 1, activityDate: comment.createdAt });
      this.changed.emit();
    } finally {
      this.posting.set(false);
    }
  }

  async remove() {
    const t = this.ticket();
    if (!t || !(await this.confirm.ask({
      title: `Delete ${t.ticketKey}?`,
      message: `“${t.title}” will be deleted with its comments and history. This cannot be undone.`,
      confirmLabel: 'Delete ticket',
      tone: 'danger',
    }))) return;
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
  return { folderId: 0, title: '', description: '', ticketType: 'Bug', assignedToUserIds: [], state: 'Open', priority: 3, impact: 'Medium', tags: [] };
}

function toForm(t: Ticket): SaveTicket {
  return normalise({
    folderId: t.folderId,
    title: t.title,
    ticketType: t.ticketType,
    description: toRichText(t.description),
    assignedToUserIds: t.assignees.map((a) => a.userId),
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
    assignedToUserIds: [...(f.assignedToUserIds ?? [])],
    state: f.state,
    priority: Number(f.priority),
    impact: f.impact,
    tags: [...f.tags],
  };
}
