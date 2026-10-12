import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, TestCasePatch } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { CrawlJobResponse, Folder, TestCase, TestCaseStatus, TestSuite, TEST_CATEGORIES, TEST_STATUSES, canManageMembers, slug } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { Topbar } from '../../shared/topbar';
import { NewSuite } from './new-suite';

/** Filters start here, and "All" is what an empty filter means. */
const ALL = 'All';

/**
 * One suite: its screenshots on top, its test cases underneath. Everything a reviewer needs to
 * take a case from "the AI said so" to "this is a ticket" — approve it, mark it passed or failed,
 * or file it — happens in the table, without a dialog per row.
 *
 * Guests and Viewers see the same page with the buttons gone: the API refuses their writes too.
 */
@Component({
  selector: 'app-suite',
  imports: [FormsModule, DatePipe, RouterLink, Topbar, Icon, Modal, NewSuite],
  template: `
    <app-topbar />

    <main class="page">
      @if (loading()) {
        <div class="card"><div class="skeleton skeleton-line w-60"></div><div class="skeleton skeleton-line w-80"></div></div>
        <p class="sr-only" role="status">Loading suite…</p>
      } @else if (!suite()) {
        <div class="card empty">
          <h2>Suite not found</h2>
          <p>It may have been deleted, or it belongs to a project you cannot see.</p>
          <a class="btn btn-primary" routerLink="/q/qa">Back to TC Generator</a>
        </div>
      } @else {
        @let s = suite()!;
        <div class="page-header">
          <div class="suite-head">
            <div class="suite-title-row">
              <a class="btn-back-circle" routerLink="/q/qa" [queryParams]="{ project: s.projectId }"
                aria-label="Back to TC Generator" title="Back to TC Generator">
                <app-icon name="back" />
              </a>
              <h1>{{ s.title }}</h1>
            </div>
            <p class="muted">
              <span class="id-chip">{{ s.projectCode }}</span>
              {{ s.projectName }}
              @if (s.folderName) { <span class="project-note-sep">·</span> {{ s.folderName }} }
              <span class="project-note-sep">·</span> created {{ s.createdAt | date: 'MMM d, y' }}
              @if (s.createdByName) { by {{ s.createdByName }} }
            </p>
            @if (s.businessDescription) {
              <p class="suite-desc prose">{{ s.businessDescription }}</p>
            }
          </div>
        </div>

        @if (activeJob(); as job) {
          <section class="crawl-banner"
            [class.is-done]="job.status === 'Done'"
            [class.is-running]="['Queued', 'Crawling', 'Generating'].includes(job.status)"
            [class.is-failed]="job.status === 'Failed' || job.status === 'Cancelled'"
            aria-label="Crawl Progress">
            <div class="crawl-banner-bar">
              <div class="crawl-bar-main">
                <span class="crawl-status-pill">
                  @if (job.status === 'Done') {
                    <app-icon name="check" />
                  } @else if (job.status === 'Failed' || job.status === 'Cancelled') {
                    <app-icon name="alert" />
                  } @else {
                    <span class="crawl-pulse-dot" aria-hidden="true"></span>
                  }
                  <span>{{ job.status }}</span>
                </span>
                @if (job.startUrl.startsWith('http://') || job.startUrl.startsWith('https://')) {
                  <a class="crawl-target-url" [href]="job.startUrl" target="_blank" rel="noopener noreferrer" [title]="job.startUrl">
                    {{ job.startUrl }}
                  </a>
                } @else {
                  <span class="crawl-target-url" [title]="job.startUrl">
                    {{ job.startUrl.replace('doc://', '').replace('local://', '') }}
                  </span>
                }
              </div>
              @if (['Queued', 'Crawling', 'Generating'].includes(job.status) && canEdit()) {
                <button class="btn btn-ghost btn-sm crawl-cancel-btn" type="button" (click)="cancelJob(job.jobId)">
                  Cancel crawl
                </button>
              } @else if ((job.status === 'Failed' || job.status === 'Cancelled' || job.pagesFound === 0) && canEdit()) {
                <button class="btn btn-ghost btn-sm crawl-cancel-btn" type="button" (click)="editingSettings.set(true)">
                  Edit & Re-crawl
                </button>
              }
            </div>

            <div class="crawl-details-row">
              <div class="crawl-stat-item">
                <span class="stat-number">{{ job.pagesFound }}</span>
                <span class="stat-label">pages discovered</span>
              </div>
              <span class="stat-dot" aria-hidden="true">•</span>
              <div class="crawl-stat-item">
                <span class="stat-number">{{ job.pagesDone }}</span>
                <span class="stat-label">pages generated</span>
              </div>
              <span class="stat-dot" aria-hidden="true">•</span>
              <div class="crawl-stat-item">
                <span class="stat-number">{{ job.clicksTried }}</span>
                <span class="stat-label">clicks tested</span>
              </div>
              <span class="stat-dot" aria-hidden="true">•</span>
              <div class="crawl-stat-item">
                <span class="stat-number">{{ job.clicksSkipped }}</span>
                <span class="stat-label">safe skipped</span>
              </div>
            </div>

            @if (job.error) {
              <div class="crawl-error-row">
                <app-icon name="alert" />
                <span>{{ job.error }}</span>
              </div>
            }
          </section>
        }

        @if (showCoverage() && activeJob()?.coverage; as cov) {
          <section class="card coverage-card" aria-labelledby="coverage-heading">
            <div class="card-head">
              <h2 id="coverage-heading" class="section-title">Crawler Coverage Report</h2>
              <button class="btn btn-ghost btn-sm" type="button" (click)="showCoverage.set(false)">Close</button>
            </div>
            <h3>Discovered Pages ({{ cov.pages.length }})</h3>
            <div class="table-wrap">
              <table class="table tc-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Title</th>
                    <th>Forms</th>
                    <th>Inputs</th>
                    <th>Buttons</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of cov.pages; track p.url) {
                    <tr>
                      <td class="mono small">{{ p.url }}</td>
                      <td>{{ p.title }}</td>
                      <td>{{ p.formsCount }}</td>
                      <td>{{ p.inputsCount }}</td>
                      <td>{{ p.buttonsCount }}</td>
                      <td>
                        @if (p.possiblyEmpty) {
                          <span class="muted small">Empty</span>
                        } @else if (p.generated) {
                          <span class="badge">Generated</span>
                        } @else {
                          <span class="muted small">Discovered</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (cov.skippedActions.length) {
              <h3 style="margin-top: 1rem;">Skipped Dangerous Actions ({{ cov.skippedActions.length }})</h3>
              <div class="table-wrap">
                <table class="table tc-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Element</th>
                      <th>Label / Text</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of cov.skippedActions; track $index) {
                      <tr>
                        <td class="mono small">{{ a.url }}</td>
                        <td>{{ a.element }}</td>
                        <td>{{ a.text }}</td>
                        <td class="muted small">{{ a.reason }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }

        <!-- Screenshots first: they are the evidence every case below is supposed to come from. -->
        @if (s.screens.length) {
          <section class="card" aria-labelledby="screens-heading">
            <h2 id="screens-heading" class="section-title">Screenshots ({{ s.screens.length }})</h2>
            <ul class="screen-strip" role="list">
              @for (screen of s.screens; track screen.screenId) {
                <li>
                  <img [src]="screenUrl(screen.attachmentId)"
                    [alt]="'Screenshot ' + ($index + 1) + ' of ' + s.screens.length" loading="lazy" />
                </li>
              }
            </ul>
          </section>
        }

        <div class="toolbar tc-toolbar">
          <div class="state-strip tc-summary" role="group" aria-label="Test case summary">
            <span class="summary-item"><b>{{ summary().total }}</b> total</span>
            <span class="summary-item summary-passed"><b>{{ summary().passed }}</b> passed</span>
            <span class="summary-item summary-failed"><b>{{ summary().failed }}</b> failed</span>
            <span class="summary-item summary-approved"><b>{{ summary().approved }}</b> approved</span>
            <span class="summary-item summary-draft"><b>{{ summary().draft }}</b> draft</span>
          </div>

          <div class="push-left tc-actions">
            @if (canEdit()) {
              <button class="btn btn-ghost" type="button" (click)="editingSettings.set(true)">
                Edit crawl settings
              </button>
            }
            @if (activeJob()?.coverage) {
              <button class="btn btn-ghost" type="button" (click)="showCoverage.set(!showCoverage())">
                Coverage Report
              </button>
            }
            @if (activeJob(); as job) {
              @if (canEdit() && ['Done', 'Failed', 'Cancelled'].includes(job.status)) {
                <button class="btn btn-ghost" type="button" (click)="regenerateJob(job.jobId)" [disabled]="busyGenerate()">
                  Regenerate cases
                </button>
              }
            }
            <button class="btn btn-ghost" type="button" (click)="toggleImport()" [attr.aria-expanded]="showImport()">
              Import / Manual
            </button>
            @if (canEdit()) {
              @if (s.screens.length) {
                <button class="btn btn-primary" type="button" (click)="generate()" [disabled]="busyGenerate() || !s.screens.length">
                  @if (busyGenerate()) {
                    <span class="spinner" aria-hidden="true"></span> Generating…
                  } @else {
                    Generate with AI
                  }
                </button>
              }
            }
          </div>
        </div>

        @if (generateError(); as error) {
          <p class="error-note" role="alert">
            <app-icon name="alert" /> {{ error }}
            <button class="link-btn" type="button" (click)="toggleImport()">Open Import / Manual</button>
          </p>
        }

        @if (showImport()) {
          <section class="card import-panel" aria-labelledby="import-heading">
            <div class="card-head">
              <h2 id="import-heading" class="section-title">Import / Manual</h2>
              <button class="btn btn-ghost btn-sm" type="button" (click)="copyPrompt()" [disabled]="promptLoading()">
                @if (copied()) { Copied } @else { {{ promptLoading() ? 'Loading…' : 'Copy prompt' }} }
              </button>
            </div>
            <p class="muted small">
              Paste this into any chat AI, then bring the JSON reply back below. This is the route that
              works with no AI key configured, and when the quota is used up.
            </p>
            <pre class="prompt-box">{{ prompt() || (promptLoading() ? 'Loading the prompt…' : '') }}</pre>
            <label class="field">
              <span>JSON reply</span>
              <textarea rows="7" class="mono" [(ngModel)]="importText"
                placeholder='{"testCases":[{"title":"…","category":"Functional","priority":2,"preconditions":"","steps":["…"],"expected":"…"}]}'></textarea>
            </label>
            <div class="import-actions">
              <button class="btn btn-primary" type="button" (click)="importCases()" [disabled]="busyImport() || !importText.trim()">
                {{ busyImport() ? 'Importing…' : 'Import cases' }}
              </button>
              <span class="hint">Everything imported arrives as Draft with source “Imported”.</span>
            </div>
          </section>
        }

        <section class="card" aria-labelledby="cases-heading">
          <div class="card-head">
            <h2 id="cases-heading" class="section-title">Test cases ({{ s.cases.length }})</h2>
          </div>

          <div class="toolbar">
            <div class="state-strip" role="group" aria-label="Filter by status">
              @for (status of statusesWithAll; track status) {
                <button type="button" class="state-chip" [class.active]="statusFilter() === status"
                  [attr.aria-pressed]="statusFilter() === status" (click)="statusFilter.set(status)">
                  {{ status }} <span class="state-chip-count">{{ countByStatus(status) }}</span>
                </button>
              }
            </div>
            <span class="toolbar-sep" aria-hidden="true"></span>
            <label class="sr-only" for="tcCategory">Category</label>
            <select id="tcCategory" class="filter-select" [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)">
              <option [value]="ALL">All categories</option>
              @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
            </select>
            <label class="sr-only" for="tcPriority">Priority</label>
            <select id="tcPriority" class="filter-select" [ngModel]="priorityFilter()" (ngModelChange)="priorityFilter.set($event)">
              <option [value]="ALL">All priorities</option>
              <option [value]="1">Priority 1</option>
              <option [value]="2">Priority 2</option>
              <option [value]="3">Priority 3</option>
              <option [value]="4">Priority 4</option>
            </select>
          </div>

          @if (visible().length === 0) {
            <div class="empty">
              @if (s.cases.length === 0) {
                <h3>No test cases yet</h3>
                @if (activeJob()?.error; as error) {
                  <p class="error-note" style="justify-content: center; margin-top: 0.5rem;"><app-icon name="alert" /> {{ error }}</p>
                }
                @if (canEdit()) {
                  @if (activeJob()?.pagesFound) {
                    <p>Pages were discovered, but generation has not run or was interrupted.</p>
                    <button class="btn btn-primary" type="button" (click)="regenerateJob(activeJob()!.jobId)" [disabled]="busyGenerate()">
                      Generate test cases
                    </button>
                  } @else {
                    <p>Generate them by crawling a site or uploading HTML files, or paste a reply from any chat AI.</p>
                  }
                } @else {
                  <p>Nobody has added cases to this suite yet.</p>
                }
              } @else {
                <h3>Nothing matches these filters</h3>
                <p><button class="link-btn" type="button" (click)="clearFilters()">Clear the filters</button></p>
              }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table table-hover tc-table">
                <thead>
                  <tr>
                    <th class="w-id">Key</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th class="col-priority">Priority</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Ticket</th>
                    <th class="w-actions"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of visible(); track c.testCaseId) {
                    <tr [class.row-expanded]="expandedId() === c.testCaseId">
                      <td>
                        <button type="button" class="icon-btn tc-expand" (click)="toggleDetail(c)"
                          [class.rotated]="expandedId() === c.testCaseId"
                          [attr.aria-expanded]="expandedId() === c.testCaseId"
                          [attr.aria-label]="'Details for ' + c.caseKey">
                          <app-icon name="caret" />
                        </button>
                        <span class="id-chip">{{ c.caseKey }}</span>
                      </td>
                      <td class="title-cell">
                        @if (editingId() === c.testCaseId) {
                          <input class="title-input" #titleInput [ngModel]="titleDraft"
                            (ngModelChange)="titleDraft = $event" (keydown.enter)="saveTitle(c)"
                            (keydown.escape)="editingId.set(null)" [attr.aria-label]="'Title of ' + c.caseKey" />
                        } @else {
                          <button type="button" class="link-btn tc-title" (click)="startTitle(c)">{{ c.title }}</button>
                        }
                      </td>
                      <td>
                        <select class="chip-select tc-cat tc-cat-{{ slug(c.category) }}" [attr.aria-label]="'Category of ' + c.caseKey"
                          [ngModel]="c.category" [disabled]="!canEdit()" (ngModelChange)="setCategory(c, $event)">
                          @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
                        </select>
                      </td>
                      <td class="col-priority">
                        <select class="chip-select tc-prio" [attr.aria-label]="'Priority of ' + c.caseKey"
                          [ngModel]="c.priority" [disabled]="!canEdit()" (ngModelChange)="setPriority(c, $event)">
                          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
                        </select>
                      </td>
                      <td>
                        <select class="chip-select tc-state tc-state-{{ slug(c.status) }}" [attr.aria-label]="'Status of ' + c.caseKey"
                          [ngModel]="c.status" [disabled]="!canEdit()" (ngModelChange)="setStatus(c, $event)">
                          @for (status of statuses; track status) { <option [value]="status">{{ status }}</option> }
                        </select>
                      </td>
                      <td><span class="tc-source" [class.tc-source-ai]="c.source === 'Ai' || c.source === 'Doc' || c.sourceUrl?.startsWith('doc://')">{{ sourceLabel(c) }}</span></td>
                      <td class="nowrap">
                        @if (c.linkedTicketId && c.linkedTicketKey) {
                          <a class="tc-ticket-link" [routerLink]="['/projects', s.projectId]" [queryParams]="{ ticket: c.linkedTicketId }">{{ c.linkedTicketKey }}</a>
                        } @else if (canEdit()) {
                          <button type="button" class="btn btn-sm btn-ghost" (click)="openCreateTicketModal(c)"
                            [disabled]="c.status !== 'Failed' || busyRow() === c.testCaseId"
                            [title]="c.status === 'Failed' ? 'Create a Bug from this case' : 'Only a Failed case can become a ticket'">
                            {{ busyRow() === c.testCaseId ? 'Creating…' : 'Create ticket' }}
                          </button>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="w-actions">
                        @if (canEdit()) {
                          @if (c.status === 'Draft') {
                            <button type="button" class="btn btn-sm btn-ghost" (click)="setStatus(c, 'Approved')"
                              [disabled]="busyRow() === c.testCaseId">Approve</button>
                          }
                          <button type="button" class="btn btn-sm btn-ghost danger" (click)="askDelete(c)">Delete</button>
                        }
                      </td>
                    </tr>

                    @if (expandedId() === c.testCaseId) {
                      <tr class="tc-detail">
                        <td colspan="8">
                          @if (detailDraft(); as d) {
                            <div class="tc-detail-grid">
                              <label class="field span-2">
                                <span>Preconditions</span>
                                <textarea rows="2" [(ngModel)]="d.preconditions" [disabled]="!canEdit()"></textarea>
                              </label>
                              <label class="field span-2">
                                <span>Steps (one per line)</span>
                                <textarea rows="6" class="mono" [(ngModel)]="d.steps" [disabled]="!canEdit()"></textarea>
                              </label>
                              <label class="field span-2">
                                <span>Expected result</span>
                                <textarea rows="3" [(ngModel)]="d.expected" [disabled]="!canEdit()"></textarea>
                              </label>
                              @if (c.sourceUrl) {
                                <div class="field span-2">
                                  <span>{{ c.sourceUrl.startsWith('doc://') ? 'Source Document' : 'Source URL' }}</span>
                                  @if (c.sourceUrl.startsWith('http://') || c.sourceUrl.startsWith('https://')) {
                                    <a class="link-btn mono" [href]="c.sourceUrl" target="_blank" rel="noopener noreferrer">
                                      {{ c.sourceUrl }}
                                    </a>
                                  } @else {
                                    <span class="mono small">{{ c.sourceUrl.replace('doc://', '').replace('local://', '') }}</span>
                                  }
                                </div>
                              }
                            </div>
                            @if (canEdit()) {
                              <div class="tc-detail-actions">
                                <button type="button" class="btn btn-primary btn-sm" (click)="saveDetail(c)"
                                  [disabled]="busyRow() === c.testCaseId">Save</button>
                                <button type="button" class="btn btn-ghost btn-sm" (click)="closeDetail()">Cancel</button>
                              </div>
                            }
                          } @else {
                            <p class="muted small">Loading…</p>
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </main>

    @if (ticketModalCase(); as tc) {
      @let s = suite()!;
      <app-modal [heading]="'Create ticket · ' + tc.caseKey" (closed)="closeTicketModal()">
        <div class="tc-ticket-modal">
          <div class="tc-ticket-case-preview">
            <div class="tc-ticket-case-meta">
              <span class="id-chip">{{ tc.caseKey }}</span>
              <span class="tc-cat-pill tc-cat-{{ slug(tc.category) }}">{{ tc.category }}</span>
              <span class="muted small">Priority {{ tc.priority }}</span>
            </div>
            <p class="tc-ticket-case-title">{{ tc.title }}</p>
          </div>

          <div class="tc-folder-picker">
            <div class="tc-folder-picker-head">
              <span class="field-label">Select destination folder</span>
              @if (canManageFolders()) {
                <button type="button" class="btn btn-ghost btn-sm tc-new-folder-toggle" (click)="toggleAddFolderInModal()">
                  <app-icon [name]="addingFolderInModal() ? 'close' : 'plus'" />
                  {{ addingFolderInModal() ? 'Cancel' : 'New folder' }}
                </button>
              }
            </div>

            @if (addingFolderInModal()) {
              <div class="tc-new-folder-box">
                <div class="tc-new-folder-grid">
                  <label class="field">
                    <span>Folder name *</span>
                    <input name="newFolderName" [(ngModel)]="newFolderName" maxlength="150"
                      placeholder="e.g. Sprint 1 or Auth" (ngModelChange)="suggestModalFolderCode()" />
                  </label>
                  <label class="field">
                    <span>Code *</span>
                    <input name="newFolderCode" [(ngModel)]="newFolderCode" maxlength="10"
                      placeholder="e.g. SP1" (ngModelChange)="newFolderCode = $event.toUpperCase(); folderCodeTouched = true" />
                  </label>
                </div>
                <div class="tc-new-folder-foot">
                  <span class="hint">Keys will look like <span class="mono">{{ s.projectCode }}-{{ newFolderCode || 'V1' }}-0001</span></span>
                  <button type="button" class="btn btn-primary btn-sm" (click)="saveNewFolderInModal()"
                    [disabled]="savingFolder() || !newFolderName.trim() || !newFolderCode.trim()">
                    {{ savingFolder() ? 'Adding…' : 'Create & select' }}
                  </button>
                </div>
              </div>
            }

            @if (folders().length > 4) {
              <input class="tc-folder-search" type="search" placeholder="Search folders by name or code…"
                [ngModel]="folderSearchQuery()" (ngModelChange)="folderSearchQuery.set($event)" />
            }

            <div class="tc-folder-list" role="radiogroup" aria-label="Project folders">
              @for (f of filteredModalFolders(); track f.folderId) {
                <button type="button" class="tc-folder-card" role="radio"
                  [class.selected]="selectedFolderId() === f.folderId"
                  [attr.aria-checked]="selectedFolderId() === f.folderId"
                  (click)="selectedFolderId.set(f.folderId)">
                  <span class="tc-folder-radio" aria-hidden="true">
                    @if (selectedFolderId() === f.folderId) {
                      <span class="tc-folder-radio-dot"></span>
                    }
                  </span>
                  <span class="id-chip">{{ f.folderCode }}</span>
                  <span class="tc-folder-card-name">{{ f.folderName }}</span>
                  <span class="tc-folder-card-right">
                    <span class="tc-folder-key-preview mono">{{ s.projectCode }}-{{ f.folderCode }}-{{ nextTicketSeq(f) }}</span>
                    <span class="tc-folder-card-count">{{ f.ticketCount }} {{ f.ticketCount === 1 ? 'ticket' : 'tickets' }}</span>
                  </span>
                </button>
              } @empty {
                <p class="muted small tc-folder-empty">No folders match “{{ folderSearchQuery() }}”.</p>
              }
            </div>
          </div>
        </div>

        <ng-container modal-actions>
          <button type="button" class="btn btn-ghost" (click)="closeTicketModal()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="confirmCreateTicket()"
            [disabled]="!selectedFolderId() || busyRow() === tc.testCaseId">
            @if (busyRow() === tc.testCaseId) {
              Creating…
            } @else if (selectedFolder(); as sf) {
              Create ticket in {{ sf.folderCode }}
            } @else {
              Create ticket
            }
          </button>
        </ng-container>
      </app-modal>
    }

    @if (editingSettings() && suite(); as s) {
      <app-new-suite [projectId]="s.projectId" [projectName]="s.projectName" [suite]="s"
        (closed)="editingSettings.set(false)"
        (updated)="onSuiteSettingsUpdated($event)"
        (crawlStarted)="onCrawlStarted($event)" />
    }
  `,
})
export class SuitePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly ALL = ALL;
  readonly statuses = TEST_STATUSES;
  readonly statusesWithAll: (typeof ALL | TestCaseStatus)[] = [ALL, ...TEST_STATUSES];
  readonly categories = TEST_CATEGORIES;
  readonly priorities = [1, 2, 3, 4];
  readonly slug = slug;

  readonly suite = signal<TestSuite | null>(null);
  readonly folders = signal<Folder[]>([]);
  readonly loading = signal(true);
  readonly busyGenerate = signal(false);
  readonly generateError = signal<string | null>(null);
  readonly busyRow = signal<number | null>(null);

  readonly ticketModalCase = signal<TestCase | null>(null);
  readonly selectedFolderId = signal<number | null>(null);
  readonly folderSearchQuery = signal('');
  readonly addingFolderInModal = signal(false);
  readonly savingFolder = signal(false);
  newFolderName = '';
  newFolderCode = '';
  folderCodeTouched = false;

  readonly canManageFolders = computed(() => canManageMembers(this.suite()?.myRole as any));
  readonly filteredModalFolders = computed(() => {
    const q = this.folderSearchQuery().trim().toLowerCase();
    if (!q) return this.folders();
    return this.folders().filter(
      (f) => f.folderName.toLowerCase().includes(q) || f.folderCode.toLowerCase().includes(q),
    );
  });
  readonly selectedFolder = computed(() => {
    const id = this.selectedFolderId();
    return this.folders().find((f) => f.folderId === id) ?? null;
  });

  readonly activeJob = signal<CrawlJobResponse | null>(null);
  readonly showCoverage = signal(false);
  readonly editingSettings = signal(false);

  onSuiteSettingsUpdated(updated: TestSuite) {
    this.suite.set(updated);
    void this.loadLatestJob(updated.suiteId);
  }

  onCrawlStarted(event: { jobId: string; suiteId: number }) {
    this.editingSettings.set(false);
    void this.loadSuite(event.suiteId);
    void this.pollJob(event.jobId);
  }

  readonly showImport = signal(false);
  readonly prompt = signal('');
  readonly promptLoading = signal(false);
  readonly copied = signal(false);
  readonly busyImport = signal(false);
  importText = '';

  readonly statusFilter = signal<typeof ALL | TestCaseStatus>(ALL);
  readonly categoryFilter = signal<string>(ALL);
  readonly priorityFilter = signal<string>(ALL);

  readonly editingId = signal<number | null>(null);
  titleDraft = '';
  readonly expandedId = signal<number | null>(null);
  readonly detailDraft = signal<{ preconditions: string; steps: string; expected: string } | null>(null);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  /** Read access is enough to look; everything that writes needs more than "Viewer". */
  readonly canEdit = computed(() => {
    const role = this.suite()?.myRole;
    return !!role && role !== 'Viewer';
  });

  readonly summary = computed(() => {
    const cases = this.suite()?.cases ?? [];
    const count = (status: TestCaseStatus) => cases.filter((c) => c.status === status).length;
    return {
      total: cases.length,
      passed: count('Passed'),
      failed: count('Failed'),
      approved: count('Approved'),
      draft: count('Draft'),
    };
  });

  readonly visible = computed(() => {
    const status = this.statusFilter();
    const category = this.categoryFilter();
    const priority = this.priorityFilter();
    return (this.suite()?.cases ?? []).filter(
      (c) =>
        (status === ALL || c.status === status) &&
        (category === ALL || c.category === category) &&
        (priority === ALL || c.priority === Number(priority)),
    );
  });

  constructor() {
    // Opening the title editor puts the caret in it, so typing starts the rename.
    effect(() => {
      if (this.editingId() == null) return;
      const el = this.titleInput()?.nativeElement;
      if (el) setTimeout(() => { el.focus(); el.select(); });
    });
  }

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('suiteId'));
    await this.loadSuite(id);
    const jobId = this.route.snapshot.queryParamMap.get('job');
    if (jobId) {
      void this.pollJob(jobId);
    } else if (id) {
      void this.loadLatestJob(id);
    }
  }

  async loadLatestJob(suiteId: number) {
    try {
      const job = await this.api.latestCrawlJobForSuite(suiteId);
      if (job) {
        this.activeJob.set(job);
        if (['Queued', 'Crawling', 'Generating'].includes(job.status)) {
          void this.pollJob(job.jobId);
        }
      }
    } catch {
      // not a crawl-based suite or no crawl job found
    }
  }

  async loadSuite(id?: number) {
    const suiteId = id ?? this.suite()?.suiteId;
    if (!suiteId) return;
    try {
      const loaded = await this.api.testSuite(suiteId);
      this.suite.set(loaded);
      void this.loadFolders(loaded.projectId);
    } catch {
      this.suite.set(null); // the interceptor has already said why
    } finally {
      this.loading.set(false);
    }
  }

  async loadFolders(projectId: number) {
    try {
      const list = await this.api.folders(projectId);
      this.folders.set(list);
      const current = this.selectedFolderId();
      if (!current || !list.some((f) => f.folderId === current)) {
        const suiteFolder = this.suite()?.folderId;
        const match = suiteFolder && list.some((f) => f.folderId === suiteFolder) ? suiteFolder : (list[0]?.folderId ?? null);
        this.selectedFolderId.set(match);
      }
    } catch {
      // ignore
    }
  }

  async pollJob(jobId: string) {
    try {
      const job = await this.api.crawlJob(jobId);
      this.activeJob.set(job);
      if (['Queued', 'Crawling', 'Generating'].includes(job.status)) {
        setTimeout(() => void this.pollJob(jobId), 2000);
      } else {
        await this.loadSuite();
        if (job.status === 'Done') {
          this.toast.success(`Crawl complete! Discovered ${job.pagesFound} pages.`);
        }
      }
    } catch {
      // ignore
    }
  }

  async cancelJob(jobId: string) {
    try {
      await this.api.cancelCrawlJob(jobId);
      this.toast.show('Crawl job cancelled.');
      await this.pollJob(jobId);
    } catch {
      // ignore
    }
  }

  async regenerateJob(jobId: string) {
    try {
      await this.api.regenerateCrawlJob(jobId);
      this.toast.success('Regeneration started.');
      void this.pollJob(jobId);
    } catch (err: any) {
      this.toast.error(err?.error?.detail || err?.message || 'Failed to regenerate.');
    }
  }

  /** An <img> cannot send an Authorization header, so the token rides in the query string. */
  screenUrl(attachmentId: number) {
    return this.api.attachmentUrl(attachmentId, this.auth.getToken());
  }

  countByStatus(status: typeof ALL | TestCaseStatus) {
    if (status === ALL) return this.suite()?.cases.length ?? 0;
    return this.suite()?.cases.filter((c) => c.status === status).length ?? 0;
  }

  clearFilters() {
    this.statusFilter.set(ALL);
    this.categoryFilter.set(ALL);
    this.priorityFilter.set(ALL);
  }

  sourceLabel(c: TestCase) {
    if (c.source === 'Doc' || c.sourceUrl?.startsWith('doc://')) return 'Doc';
    return c.source === 'Ai' ? 'AI' : c.source === 'Imported' ? 'Imported' : 'Manual';
  }

  // ---------- Generation and import ----------

  async generate() {
    const suite = this.suite();
    if (!suite || this.busyGenerate()) return;
    this.busyGenerate.set(true);
    this.generateError.set(null);
    try {
      const added = await this.api.generateTestCases(suite.suiteId);
      this.suite.update((s) => (s ? { ...s, cases: [...s.cases, ...added] } : s));
      this.toast.success(`Added ${added.length} test ${added.length === 1 ? 'case' : 'cases'} as Draft.`);
    } catch (err) {
      // Shown next to the button, in the provider's own words: a spent quota is not a crash.
      this.generateError.set(this.message(err));
    } finally {
      this.busyGenerate.set(false);
    }
  }

  async toggleImport() {
    this.showImport.update((open) => !open);
    if (!this.showImport() || this.prompt() || this.promptLoading()) return;
    const suite = this.suite();
    if (!suite) return;

    this.promptLoading.set(true);
    try {
      this.prompt.set((await this.api.testSuitePrompt(suite.suiteId)).prompt);
    } catch {
      // The interceptor has already said why; the box stays where it is.
    } finally {
      this.promptLoading.set(false);
    }
  }

  async copyPrompt() {
    if (!this.prompt()) return;
    try {
      await navigator.clipboard.writeText(this.prompt());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.toast.error('Could not copy automatically — select the text and copy it yourself.');
    }
  }

  async importCases() {
    const suite = this.suite();
    if (!suite || this.busyImport()) return;
    this.busyImport.set(true);
    try {
      const added = await this.api.importTestCases(suite.suiteId, this.importText.trim());
      this.suite.update((s) => (s ? { ...s, cases: [...s.cases, ...added] } : s));
      this.importText = '';
      this.toast.success(`Imported ${added.length} test ${added.length === 1 ? 'case' : 'cases'} as Draft.`);
    } catch (err) {
      // A reply nothing could be read from saves nothing, and says so here.
      this.toast.error(this.message(err));
    } finally {
      this.busyImport.set(false);
    }
  }

  // ---------- Editing rows ----------

  startTitle(c: TestCase) {
    if (!this.canEdit()) return;
    this.editingId.set(c.testCaseId);
    this.titleDraft = c.title;
  }

  async saveTitle(c: TestCase) {
    const title = this.titleDraft.trim();
    this.editingId.set(null);
    if (!title || title === c.title) return;
    await this.saveCase(c, { title });
  }

  async setCategory(c: TestCase, category: string) {
    if (category === c.category) return;
    await this.saveCase(c, { category });
  }

  async setPriority(c: TestCase, priority: string) {
    const value = Number(priority);
    if (value === c.priority) return;
    await this.saveCase(c, { priority: value });
  }

  async setStatus(c: TestCase, status: string) {
    if (status === c.status) return;
    this.busyRow.set(c.testCaseId);
    const ok = await this.saveCase(c, { status });
    this.busyRow.set(null);
    if (ok) this.toast.success(`${c.caseKey} is now ${status}.`);
  }

  toggleDetail(c: TestCase) {
    if (this.expandedId() === c.testCaseId) return this.closeDetail();
    this.expandedId.set(c.testCaseId);
    this.detailDraft.set({
      preconditions: c.preconditions,
      steps: c.steps.join('\n'),
      expected: c.expected,
    });
  }

  closeDetail() {
    this.expandedId.set(null);
    this.detailDraft.set(null);
  }

  async saveDetail(c: TestCase) {
    const draft = this.detailDraft();
    if (!draft) return;
    this.busyRow.set(c.testCaseId);
    const ok = await this.saveCase(c, {
      preconditions: draft.preconditions,
      steps: draft.steps.split('\n').map((s) => s.trim()).filter(Boolean),
      expected: draft.expected,
    });
    this.busyRow.set(null);
    if (ok) {
      this.closeDetail();
      this.toast.success(`${c.caseKey} saved.`);
    }
  }

  async askDelete(c: TestCase) {
    if (!(await this.confirm.ask({
      title: `Delete ${c.caseKey}?`,
      message: `This removes “${c.title}” from the suite. A ticket already created from it stays.`,
      confirmLabel: 'Delete test case',
      tone: 'danger',
    }))) return;

    this.busyRow.set(c.testCaseId);
    try {
      await this.api.deleteTestCase(c.testCaseId);
      this.suite.update((s) => (s ? { ...s, cases: s.cases.filter((x) => x.testCaseId !== c.testCaseId) } : s));
      if (this.expandedId() === c.testCaseId) this.closeDetail();
    } catch (err) {
      this.toast.error(this.message(err));
    } finally {
      this.busyRow.set(null);
    }
  }

  async openCreateTicketModal(c: TestCase) {
    if (c.linkedTicketId) return;
    this.ticketModalCase.set(c);
    this.addingFolderInModal.set(false);
    this.folderSearchQuery.set('');
    const s = this.suite();
    if (s && this.folders().length === 0) {
      await this.loadFolders(s.projectId);
    }
  }

  closeTicketModal() {
    this.ticketModalCase.set(null);
    this.addingFolderInModal.set(false);
    this.folderSearchQuery.set('');
  }

  nextTicketSeq(f: Folder): string {
    return String((f.ticketCount ?? 0) + 1).padStart(4, '0');
  }

  toggleAddFolderInModal() {
    const next = !this.addingFolderInModal();
    this.addingFolderInModal.set(next);
    if (next) {
      this.newFolderName = '';
      this.newFolderCode = '';
      this.folderCodeTouched = false;
    }
  }

  suggestModalFolderCode() {
    if (this.folderCodeTouched) return;
    const words = this.newFolderName.trim().split(/\s+/).filter(Boolean);
    const derived = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4);
    this.newFolderCode = derived.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
  }

  async saveNewFolderInModal() {
    const s = this.suite();
    const name = this.newFolderName.trim();
    const code = this.newFolderCode.trim().toUpperCase();
    if (!s || !name || !code || this.savingFolder()) return;
    this.savingFolder.set(true);
    try {
      const { id } = await this.api.createFolder(s.projectId, name, code);
      this.addingFolderInModal.set(false);
      await this.loadFolders(s.projectId);
      this.selectedFolderId.set(id);
      this.toast.success(`Folder “${name}” (${code}) created.`);
    } catch (err) {
      this.toast.error(this.message(err));
    } finally {
      this.savingFolder.set(false);
    }
  }

  async confirmCreateTicket() {
    const c = this.ticketModalCase();
    const folderId = this.selectedFolderId();
    if (!c || c.linkedTicketId || !folderId) return;
    this.busyRow.set(c.testCaseId);
    try {
      const { id, ticketKey } = await this.api.createTicketFromTestCase(c.testCaseId, folderId);
      this.patch(c, { linkedTicketId: id, linkedTicketKey: ticketKey });
      this.folders.update((list) =>
        list.map((f) =>
          f.folderId === folderId
            ? { ...f, ticketCount: f.ticketCount + 1, openTicketCount: f.openTicketCount + 1 }
            : f,
        ),
      );
      this.closeTicketModal();
      this.toast.success(`${c.caseKey} is now ticket ${ticketKey}.`);
    } catch (err) {
      this.toast.error(this.message(err));
    } finally {
      this.busyRow.set(null);
    }
  }

  /** Saves one case and keeps the row in step, so the table never lies about what the API holds. */
  private async saveCase(c: TestCase, patch: TestCasePatch): Promise<boolean> {
    try {
      await this.api.updateTestCase(c.testCaseId, patch);
      this.patch(c, patch);
      return true;
    } catch (err) {
      this.toast.error(this.message(err));
      return false;
    }
  }

  private patch(c: TestCase, changes: object) {
    const clean = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    this.suite.update((s) =>
      s ? { ...s, cases: s.cases.map((x) => (x.testCaseId === c.testCaseId ? { ...x, ...clean } : x)) } : s,
    );
  }

  /** The same words the error interceptor shows, kept for the box under the Generate button. */
  private message(err: unknown): string {
    const body = (err as HttpErrorResponse | undefined)?.error;
    return body?.detail || body?.title || body?.message || 'Something went wrong. Try again.';
  }
}
