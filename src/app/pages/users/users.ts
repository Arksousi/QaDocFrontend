import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ROLES, Role, User, initials } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Topbar } from '../../shared/topbar';

interface UserDraft {
  userId: number;
  username: string;
  displayName: string;
  password: string;
  role: Role;
  isActive: boolean;
}

/** Admin-only: add people, change roles, deactivate, reset passwords. */
@Component({
  selector: 'app-users',
  imports: [FormsModule, DatePipe, Modal, Topbar],
  template: `
    <app-topbar crumb="Users">
      <button class="btn btn-primary" (click)="openAdd()">+ Add user</button>
    </app-topbar>

    <main class="page">
      <div class="page-header">
        <div>
          <h1>Users</h1>
          <p class="muted">{{ activeCount() }} active · {{ users().length }} total. Deactivated users can't sign in but stay visible in ticket history.</p>
        </div>
      </div>

      <section class="card">
        <div class="toolbar">
          <input class="search" type="search" placeholder="Search name or username…" aria-label="Search users"
            [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </div>
        <div class="table-wrap">
          <table class="table table-hover">
            <thead>
              <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th class="w-actions"></th></tr>
            </thead>
            <tbody>
              @for (u of filtered(); track u.userId) {
                <tr [class.row-inactive]="!u.isActive">
                  <td>
                    <span class="person">
                      <span class="avatar" aria-hidden="true">{{ initialsOf(u.displayName) }}</span>
                      {{ u.displayName }}
                      @if (u.userId === auth.user()?.userId) { <span class="muted small">(you)</span> }
                    </span>
                  </td>
                  <td class="mono">{{ u.username }}</td>
                  <td><span class="role role-{{ u.role.toLowerCase() }}">{{ u.role }}</span></td>
                  <td>
                    @if (u.isActive) { <span class="status-dot active"></span> Active } @else { <span class="status-dot"></span> Deactivated }
                  </td>
                  <td class="muted nowrap">{{ u.createdAt | date: 'MMM d, y' }}</td>
                  <td class="nowrap actions">
                    <button class="btn btn-ghost btn-sm" (click)="openEdit(u)">Edit</button>
                    @if (u.userId !== auth.user()?.userId) {
                      <button class="btn btn-ghost btn-sm" (click)="openReset(u)">Reset password</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="muted center">No users match “{{ search() }}”.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </main>

    @if (draft(); as d) {
      <app-modal [heading]="d.userId ? 'Edit user' : 'Add user'" (closed)="draft.set(null)">
        <form id="userForm" class="form" (ngSubmit)="save(d)">
          <label>Display name *
            <input name="displayName" [(ngModel)]="d.displayName" required maxlength="100" autofocus placeholder="e.g. Dana Lee" />
          </label>
          <label>Username * @if (!d.userId) { <small class="muted">letters, digits, . _ -</small> }
            <input name="username" [(ngModel)]="d.username" required minlength="3" maxlength="50" [disabled]="!!d.userId"
              pattern="[A-Za-z0-9._\\-]+" autocomplete="off" placeholder="e.g. dana.lee" />
          </label>
          @if (!d.userId) {
            <label>Temporary password * <small class="muted">at least 8 characters; share it with the user</small>
              <input name="password" type="text" [(ngModel)]="d.password" required minlength="8" autocomplete="off" />
            </label>
          }
          <label>Role
            <select name="role" [(ngModel)]="d.role">
              @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
            </select>
            <small class="muted">{{ d.role === 'Admin' ? 'Can manage users and delete tickets.' : 'Can create and edit tickets, comment and add projects.' }}</small>
          </label>
          @if (d.userId) {
            <label class="check">
              <input name="isActive" type="checkbox" [(ngModel)]="d.isActive" /> Active (can sign in)
            </label>
          }
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="draft.set(null)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="userForm" [disabled]="busy() || !canSave(d)">
            {{ d.userId ? 'Save changes' : 'Add user' }}
          </button>
        </ng-container>
      </app-modal>
    }

    @if (resetting(); as u) {
      <app-modal heading="Reset password" (closed)="resetting.set(null)">
        <form id="resetForm" class="form" (ngSubmit)="reset(u)">
          <p>Set a new temporary password for <strong>{{ u.displayName }}</strong>. They will be signed out everywhere.</p>
          <label>New password <small class="muted">at least 8 characters</small>
            <input name="newPassword" type="text" [(ngModel)]="newPassword" required minlength="8" autocomplete="off" autofocus />
          </label>
        </form>
        <ng-container modal-actions>
          <button class="btn btn-ghost" (click)="resetting.set(null)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="resetForm" [disabled]="busy() || newPassword.length < 8">Reset password</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly search = signal('');
  readonly draft = signal<UserDraft | null>(null);
  readonly resetting = signal<User | null>(null);
  readonly busy = signal(false);
  newPassword = '';

  readonly roles = ROLES;
  readonly initialsOf = initials;
  readonly activeCount = computed(() => this.users().filter((u) => u.isActive).length);
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q
      ? this.users().filter((u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      : this.users();
  });

  async ngOnInit() {
    await this.load();
  }

  openAdd() {
    this.draft.set({ userId: 0, username: '', displayName: '', password: '', role: 'Member', isActive: true });
  }

  openEdit(u: User) {
    this.draft.set({ userId: u.userId, username: u.username, displayName: u.displayName, password: '', role: u.role, isActive: u.isActive });
  }

  openReset(u: User) {
    this.newPassword = '';
    this.resetting.set(u);
  }

  canSave(d: UserDraft) {
    if (!d.displayName.trim()) return false;
    return d.userId ? true : /^[A-Za-z0-9._-]{3,50}$/.test(d.username.trim()) && d.password.length >= 8;
  }

  async save(d: UserDraft) {
    if (this.busy() || !this.canSave(d)) return;
    this.busy.set(true);
    try {
      if (d.userId) {
        await this.api.updateUser(d.userId, { displayName: d.displayName.trim(), role: d.role, isActive: d.isActive });
        this.toast.success(`${d.displayName.trim()} updated.`);
      } else {
        await this.api.createUser({ username: d.username.trim(), displayName: d.displayName.trim(), password: d.password, role: d.role });
        this.toast.success(`${d.displayName.trim()} can now sign in as “${d.username.trim()}”.`);
      }
      this.draft.set(null);
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  async reset(u: User) {
    if (this.busy() || this.newPassword.length < 8) return;
    this.busy.set(true);
    try {
      await this.api.resetPassword(u.userId, this.newPassword);
      this.toast.success(`Password reset for ${u.displayName}.`);
      this.resetting.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  private async load() {
    this.users.set(await this.api.users());
  }
}
