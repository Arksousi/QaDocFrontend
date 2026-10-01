import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AvatarService } from '../../core/avatar.service';
import { ConfirmService } from '../../core/confirm.service';
import { ProfileUpdate } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';
import { ChangePassword } from '../../shared/change-password';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';

/** The side of the square a picture is stored at: sharp at the largest size shown (112px) on 2× screens. */
const PICTURE_SIDE = 256;
/** What may be picked before cropping; the stored square is far smaller. */
const MAX_PICK_BYTES = 15 * 1024 * 1024;
const BIO_MAX = 500;

/**
 * Crops a picture to its centred square and scales it to PICTURE_SIDE, re-encoded as WebP (PNG
 * where the browser cannot write WebP). Done here so the server only ever stores a small square.
 */
async function toSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(PICTURE_SIDE, side);
    canvas.getContext('2d')!.drawImage(
      img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/webp', 0.9));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Your profile: a picture that replaces your initials everywhere, and the details your team sees
 * on your card. Username and role are shown but belong to the Admin.
 */
@Component({
  selector: 'app-profile',
  imports: [Avatar, ChangePassword, DatePipe, FormsModule, Icon, Topbar],
  template: `
    <app-topbar crumb="Profile" />

    <main class="page">
      <div class="page-header">
        <div>
          <h1>Profile</h1>
          <p class="muted">How you appear to your team across QaDoc.</p>
        </div>
      </div>

      @if (auth.user(); as me) {
        <div class="profile-grid">
          <section class="card profile-card" aria-label="Picture and account">
            <div class="profile-photo" [class.profile-photo-busy]="uploading()">
              <app-avatar size="xl" [userId]="me.userId" [name]="form.displayName || me.displayName" [card]="false" />
            </div>
            <strong class="profile-name">{{ form.displayName || me.displayName }}</strong>
            @if (form.jobTitle) { <span class="muted">{{ form.jobTitle }}</span> }

            <input #picker type="file" class="sr-only" accept="image/png,image/jpeg,image/webp"
              aria-label="Choose a profile picture" (change)="pick($event)" />
            <div class="profile-photo-actions">
              <button type="button" class="btn btn-ghost btn-sm" [disabled]="uploading()" (click)="picker.click()">
                <app-icon name="picture" /> {{ hasPicture() ? 'Change picture' : 'Upload picture' }}
              </button>
              @if (hasPicture()) {
                <button type="button" class="btn btn-ghost btn-sm danger" [disabled]="uploading()" (click)="removePicture()">Remove</button>
              }
            </div>
            <p class="hint">PNG, JPEG or WebP. It is cropped to a square.</p>

            <dl class="profile-facts">
              <div><dt>Username</dt><dd>{{ '@' + me.username }}</dd></div>
              <div><dt>Role</dt><dd><span class="role role-{{ me.role.toLowerCase() }}">{{ me.role }}</span></dd></div>
              <div><dt>Member since</dt><dd>{{ me.createdAt | date: 'MMMM y' }}</dd></div>
            </dl>
          </section>

          <section class="card profile-form-card" aria-label="Details">
            <h2 class="section-title">Details</h2>
            <form id="profileForm" class="form" (ngSubmit)="save()">
              <label>Display name *
                <input name="displayName" [(ngModel)]="form.displayName" (ngModelChange)="touch()" required maxlength="100" autocomplete="name" />
              </label>
              <div class="form-grid">
                <label>Email
                  <input name="email" type="email" [(ngModel)]="form.email" (ngModelChange)="touch()" maxlength="254" autocomplete="email" placeholder="name@company.com" />
                </label>
                <label>Phone
                  <input name="phone" type="tel" [(ngModel)]="form.phone" (ngModelChange)="touch()" maxlength="40" autocomplete="tel" placeholder="+961 70 123 456" />
                </label>
              </div>
              <label>Job title
                <input name="jobTitle" [(ngModel)]="form.jobTitle" (ngModelChange)="touch()" maxlength="100" autocomplete="organization-title" placeholder="e.g. QA Engineer" />
              </label>
              <label>About
                <textarea name="bio" rows="4" [(ngModel)]="form.bio" (ngModelChange)="touch()" [maxlength]="bioMax" placeholder="What you work on, how to reach you best…"></textarea>
                <span class="hint profile-count">{{ (form.bio ?? '').length }}/{{ bioMax }}</span>
              </label>
            </form>
            <div class="box-actions">
              <button type="button" class="link-btn" (click)="changingPassword.set(true)"><app-icon name="lock" /> Change password</button>
              <span class="push-left"></span>
              @if (dirty()) { <span class="muted small">Unsaved changes</span> }
              <button type="button" class="btn btn-ghost" [disabled]="!dirty() || saving()" (click)="reset()">Discard</button>
              <button type="submit" form="profileForm" class="btn btn-primary" [disabled]="!dirty() || saving() || !form.displayName.trim()">Save changes</button>
            </div>
          </section>
        </div>
      }
    </main>

    @if (changingPassword()) {
      <app-change-password (closed)="changingPassword.set(false)" />
    }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly avatars = inject(AvatarService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly bioMax = BIO_MAX;
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly changingPassword = signal(false);
  /** Bumped on every edit, so dirty() recomputes against the plain form object. */
  private readonly edits = signal(0);

  form: ProfileUpdate = this.fromUser();

  /** Whether you have a picture: from the avatar list, then kept up to date by upload and remove. */
  readonly hasPicture = signal(false);

  readonly dirty = computed(() => {
    this.edits();
    const saved = this.fromUser();
    return (Object.keys(saved) as (keyof ProfileUpdate)[]).some((k) => (this.form[k] ?? '').trim() !== (saved[k] ?? '').trim());
  });

  constructor() {
    // Whether a picture exists is known from the avatar list; ask once for this page.
    this.api.avatarVersions().then((list) => this.hasPicture.set(list.some((a) => a.userId === this.auth.user()?.userId))).catch(() => {});
  }

  /** Template-driven inputs write straight into `form`; each one calls this so dirty() looks again. */
  touch() {
    this.edits.update((n) => n + 1);
  }

  reset() {
    this.form = this.fromUser();
    this.edits.update((n) => n + 1);
  }

  async save() {
    if (!this.dirty() || this.saving() || !this.form.displayName.trim()) return;
    this.saving.set(true);
    try {
      const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const saved = await this.api.updateProfile({
        displayName: this.form.displayName.trim(),
        email: blank(this.form.email), phone: blank(this.form.phone), jobTitle: blank(this.form.jobTitle), bio: blank(this.form.bio),
      });
      this.auth.updateUser(saved);
      this.form = this.fromUser();
      this.toast.success('Profile saved.');
    } finally {
      this.saving.set(false);
    }
  }

  async pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // picking the same file again should still fire
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return this.toast.error('Choose a PNG, JPEG or WebP picture.');
    if (file.size > MAX_PICK_BYTES) return this.toast.error('That picture is too large. Choose one under 15 MB.');

    this.uploading.set(true);
    try {
      const square = await toSquare(file);
      const { avatarVersion } = await this.api.uploadAvatar(square);
      const me = this.auth.user()!;
      this.avatars.setOwn(me.userId, avatarVersion, square);
      this.auth.updateUser({ ...me, avatarVersion });
      this.hasPicture.set(true);
      this.toast.success('Picture updated.');
    } catch (e) {
      // Upload failures are reported by the error interceptor; a picture the browser cannot read is not.
      if (!(e instanceof Object && 'status' in e)) this.toast.error('That picture could not be read. Try another file.');
    } finally {
      this.uploading.set(false);
    }
  }

  async removePicture() {
    if (!(await this.confirm.ask({
      title: 'Remove your picture?',
      message: 'Your initials will show instead, everywhere in QaDoc.',
      confirmLabel: 'Remove picture',
      tone: 'danger',
    }))) return;
    this.uploading.set(true);
    try {
      const { avatarVersion } = await this.api.deleteAvatar();
      const me = this.auth.user()!;
      this.avatars.setOwn(me.userId, avatarVersion, null);
      this.auth.updateUser({ ...me, avatarVersion });
      this.hasPicture.set(false);
      this.toast.success('Picture removed.');
    } finally {
      this.uploading.set(false);
    }
  }

  private fromUser(): ProfileUpdate {
    const u = this.auth.user();
    return {
      displayName: u?.displayName ?? '',
      email: u?.email ?? '',
      phone: u?.phone ?? '',
      jobTitle: u?.jobTitle ?? '',
      bio: u?.bio ?? '',
    };
  }
}
