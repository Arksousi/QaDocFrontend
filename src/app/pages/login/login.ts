import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Sign in, or, on a brand-new installation, create the first Admin account. */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="auth-page">
      <div class="auth-card card">
        <div class="brand auth-brand"><img class="brand-logo" src="logo.svg" alt="QaDoc" /></div>

        @if (needsSetup() === null) {
          <p class="muted">Loading…</p>
        } @else if (needsSetup()) {
          <h1>Create admin account</h1>
          <p class="muted">Welcome! This is a new installation. Create the first account; it will be the Admin who adds everyone else.</p>
          <form class="form" (ngSubmit)="createAdmin()">
            <label>Display name *
              <input name="displayName" [(ngModel)]="displayName" required maxlength="100" autocomplete="name" autofocus placeholder="e.g. Dana Lee" />
            </label>
            <label>Username *
              <input name="username" [(ngModel)]="username" required minlength="3" maxlength="50" autocomplete="username" pattern="[A-Za-z0-9._\\-]+" placeholder="e.g. dana.lee" />
            </label>
            <label>Password * <small class="muted">at least 8 characters</small>
              <input name="password" type="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
            </label>
            <label>Confirm password *
              <input name="confirm" type="password" [(ngModel)]="confirm" required autocomplete="new-password" />
            </label>
            @if (confirm && password !== confirm) { <p class="field-error">Passwords do not match.</p> }
            <button class="btn btn-primary btn-block" type="submit"
              [disabled]="busy() || !displayName.trim() || username.trim().length < 3 || password.length < 8 || password !== confirm">
              Create admin & sign in
            </button>
          </form>
        } @else {
          <h1>Sign in</h1>
          <form class="form" (ngSubmit)="signIn()">
            <label>Username
              <input name="username" [(ngModel)]="username" required autocomplete="username" autofocus />
            </label>
            <label>Password
              <input name="password" type="password" [(ngModel)]="password" required autocomplete="current-password" />
            </label>
            <button class="btn btn-primary btn-block" type="submit" [disabled]="busy() || !username.trim() || !password">Sign in</button>
          </form>
          <p class="muted small auth-help">No account? Ask your QaDoc Admin to create one.</p>
        }
      </div>
    </main>
  `,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string | undefined>();
  readonly needsSetup = signal<boolean | null>(null);
  readonly busy = signal(false);

  displayName = '';
  username = '';
  password = '';
  confirm = '';

  async ngOnInit() {
    try {
      this.needsSetup.set((await this.auth.status()).needsSetup);
    } catch {
      this.needsSetup.set(false);
    }
  }

  async signIn() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.login(this.username.trim(), this.password);
      this.goOn();
    } catch {
      this.password = '';
    } finally {
      this.busy.set(false);
    }
  }

  async createAdmin() {
    if (this.busy() || this.password !== this.confirm) return;
    this.busy.set(true);
    try {
      await this.auth.setup(this.username.trim(), this.displayName.trim(), this.password);
      this.goOn();
    } catch {
      // Setup may have been completed from another browser meanwhile: show the sign-in form.
      this.needsSetup.set((await this.auth.status().catch(() => ({ needsSetup: false }))).needsSetup);
    } finally {
      this.busy.set(false);
    }
  }

  private goOn() {
    const target = this.returnUrl();
    // Only follow in-app paths.
    this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/');
  }
}
