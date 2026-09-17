import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { PROJECT_ROLES, Project, ProjectMember, ProjectRole, UserOption } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

/** Who can see a project, and how much they can do in it. Managers and Admins only. */
@Component({
  selector: 'app-project-members',
  imports: [FormsModule, Modal],
  template: `
    <app-modal [heading]="'Members of ' + project().projectName" [wide]="true" (closed)="closed.emit()">
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else {
        <div class="toolbar">
          <select aria-label="User to add" [ngModel]="pickedUser()" (ngModelChange)="pickedUser.set(+$event)">
            <option [value]="0" disabled>Choose someone…</option>
            @for (u of addable(); track u.userId) {
              <option [value]="u.userId">{{ u.displayName }} ({{ '@' + u.username }})</option>
            }
          </select>
          <select aria-label="Role for the new member" [ngModel]="pickedRole()" (ngModelChange)="pickedRole.set($event)">
            @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
          </select>
          <button class="btn btn-primary" (click)="add()" [disabled]="!pickedUser() || saving()">Add member</button>
          @if (!addable().length) { <span class="muted small">Everyone already has access.</span> }
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Name</th><th>Access</th><th class="w-actions"><span class="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              @for (m of members(); track m.userId) {
                <tr>
                  <td>
                    {{ m.displayName }}
                    <span class="muted small">{{ '@' + m.username }}</span>
                    @if (!m.isActive) { <span class="muted small">· inactive</span> }
                  </td>
                  <td>
                    <select [attr.aria-label]="'Access for ' + m.displayName"
                      [ngModel]="m.role" (ngModelChange)="changeRole(m, $event)" [disabled]="saving()">
                      @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
                    </select>
                  </td>
                  <td class="w-actions">
                    <button class="btn btn-sm btn-ghost danger" (click)="remove(m)" [disabled]="saving()">Remove</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="muted center">No members yet — only Admins can see this project.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <p class="hint">
          <strong>Viewer</strong> reads tickets and comments ·
          <strong>Contributor</strong> also creates and edits them ·
          <strong>Manager</strong> also manages this list.
        </p>
      }

      <ng-container modal-actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Close</button>
      </ng-container>
    </app-modal>
  `,
})
export class ProjectMembers implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly project = input.required<Project>();
  readonly closed = output<void>();
  /** Raised when membership changed, so the caller can refresh its own project list. */
  readonly changed = output<void>();

  readonly roles = PROJECT_ROLES;
  readonly members = signal<ProjectMember[]>([]);
  readonly users = signal<UserOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly pickedUser = signal(0);
  readonly pickedRole = signal<ProjectRole>('Viewer');

  /** Active users who are not already on the project. */
  readonly addable = computed(() => {
    const taken = new Set(this.members().map((m) => m.userId));
    return this.users().filter((u) => !taken.has(u.userId));
  });

  async ngOnInit() {
    try {
      const [members, users] = await Promise.all([
        this.api.projectMembers(this.project().projectId),
        this.api.userOptions(),
      ]);
      this.members.set(members);
      this.users.set(users);
    } finally {
      this.loading.set(false);
    }
  }

  async add() {
    const userId = this.pickedUser();
    if (!userId || this.saving()) return;
    await this.save(userId, this.pickedRole(), () => {
      this.pickedUser.set(0);
      this.toast.success('Member added.');
    });
  }

  async changeRole(member: ProjectMember, role: ProjectRole) {
    if (role === member.role || this.saving()) return;
    await this.save(member.userId, role, () => this.toast.success(`${member.displayName} is now ${role}.`));
  }

  async remove(member: ProjectMember) {
    if (this.saving()) return;
    if (!confirm(`Remove ${member.displayName} from “${this.project().projectName}”?`)) return;
    this.saving.set(true);
    try {
      await this.api.removeProjectMember(this.project().projectId, member.userId);
      this.toast.success(`${member.displayName} removed.`);
      await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private async save(userId: number, role: ProjectRole, onDone: () => void) {
    this.saving.set(true);
    try {
      await this.api.saveProjectMember(this.project().projectId, userId, role);
      onDone();
      await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  /** Always re-read from the API: the server may have refused part of a change. */
  private async reload() {
    this.members.set(await this.api.projectMembers(this.project().projectId));
    this.changed.emit();
  }
}
