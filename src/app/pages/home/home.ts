import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';

/**
 * The launcher: what signing in lands on. Two cards, two apps — the ticket tracker and the
 * Test Case Generator. Real links, so it is keyboard reachable in order and opens in a new
 * tab like any other link; the top bar carries the same jump on every page.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, Topbar, Icon],
  template: `
    <app-topbar />

    <main class="page launcher">
      <h1>Choose an app</h1>
      <p class="muted">Two tools in one workspace. The switcher in the top bar jumps between them at any time — signing out is never part of it.</p>

      <div class="app-grid">
        <a class="card app-card" routerLink="/" aria-label="Open Q Desk, the ticket tracker">
          <span class="app-mark app-mark-qadoc" aria-hidden="true"><app-icon name="folder" /></span>
          <h2>Q Desk</h2>
          <p>The ticket tracker: projects, folders and numbered tickets with comments, attachments, history and a state graph.</p>
          <span class="app-open">Open Q Desk <app-icon name="arrow-right" /></span>
        </a>

        <a class="card app-card" routerLink="/q" aria-label="Open Q Generator">
          <span class="app-mark app-mark-tests" aria-hidden="true"><app-icon name="testcase" /></span>
          <h2>Q Generator</h2>
          <p>QA test cases, QC product documentation, and user manuals generated from application screenshots.</p>
          @if (auth.isGuest()) {
            <p class="hint">You are touring sample data, so Q Generator is read-only.</p>
          }
          <span class="app-open">Open Q Generator <app-icon name="arrow-right" /></span>
        </a>
      </div>
    </main>
  `,
})
export class HomePage {
  protected readonly auth = inject(AuthService);
}
