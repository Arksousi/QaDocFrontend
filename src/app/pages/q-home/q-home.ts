import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';
import { Topbar } from '../../shared/topbar';

/**
 * Q Generator Hub: offers QA Generator (test cases) and QC Generator (documentation & user manuals).
 */
@Component({
  selector: 'app-q-home',
  imports: [RouterLink, Topbar, Icon],
  template: `
    <app-topbar />

    <main class="page launcher">
      <div class="launcher-header">
        <h1>Q Generator</h1>
        <p class="muted">AI-assisted quality engineering tools: generate test cases or produce complete product specifications and user manuals.</p>
      </div>

      <div class="app-grid">
        <a class="card app-card" routerLink="/q/qa" aria-label="Open QA Generator">
          <span class="app-mark app-mark-tests" aria-hidden="true"><app-icon name="testcase" /></span>
          <h2>QA Generator</h2>
          <p>Turn screenshots and a business description into structured test cases you can review, approve, execute, and file as tickets.</p>
          @if (auth.isGuest()) {
            <p class="hint">You are touring sample data; QA suites are read-only.</p>
          }
          <span class="app-open">Open QA Generator <app-icon name="arrow-right" /></span>
        </a>

        <a class="card app-card" routerLink="/q/qc" aria-label="Open QC Generator">
          <span class="app-mark app-mark-qadoc" aria-hidden="true"><app-icon name="folder" /></span>
          <h2>QC Generator</h2>
          <p>Upload ordered screenshots and app logo. Sequential AI builds comprehensive product documentation and user manuals.</p>
          @if (auth.isGuest()) {
            <p class="hint">You are touring sample data; QC doc sets are read-only.</p>
          }
          <span class="app-open">Open QC Generator <app-icon name="arrow-right" /></span>
        </a>
      </div>
    </main>
  `,
})
export class QHomePage {
  protected readonly auth = inject(AuthService);
}
