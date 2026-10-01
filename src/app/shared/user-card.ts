import { DatePipe } from '@angular/common';
import { Component, Directive, ElementRef, HostListener, computed, inject, input } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { avatarTone, initials, overLimit } from '../core/models';
import { UserCardService } from '../core/user-card.service';
import { AvatarService } from '../core/avatar.service';

/** The card is this wide; used to keep it on screen. */
const CARD_WIDTH = 300;
/** Roughly how tall it is, to decide whether it fits below the avatar. */
const CARD_HEIGHT = 300;

/**
 * Put on any avatar: `<span class="avatar" [appUserCard]="u.userId">`. Resting the pointer on it
 * opens that person's card — for Admins and Leaders only; for anyone else it does nothing.
 * A null id (a history row whose user has gone) does nothing either.
 */
@Directive({ selector: '[appUserCard]' })
export class UserCardTrigger {
  private readonly cards = inject(UserCardService);
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly appUserCard = input<number | null | undefined>(null);

  @HostListener('mouseenter')
  onEnter() {
    const id = this.appUserCard();
    if (id && this.auth.canLead()) this.cards.hoverStart(id, this.host.nativeElement);
  }

  @HostListener('mouseleave')
  onLeave() {
    if (this.auth.canLead()) this.cards.hoverEnd();
  }
}

/** The single hover card, rendered once by App and positioned beside whichever avatar asked. */
@Component({
  selector: 'app-user-card',
  imports: [DatePipe],
  template: `
    @if (cards.open(); as o) {
      <div class="user-card" role="dialog" [attr.aria-label]="o.card ? o.card.displayName : 'User details'"
        [style.left.px]="position().left" [style.top.px]="position().top"
        (mouseenter)="cards.keep()" (mouseleave)="cards.hoverEnd()">
        @if (o.card; as c) {
          <div class="user-card-head">
            <!-- Drawn here rather than with <app-avatar>, which itself uses this card: no import cycle. -->
            @if (avatars.src(c.userId); as url) {
              <img class="avatar avatar-lg avatar-img" [src]="url" alt="" aria-hidden="true" />
            } @else {
              <span class="avatar avatar-lg avatar-t{{ toneOf(c.displayName) }}" aria-hidden="true">{{ initialsOf(c.displayName) }}</span>
            }
            <div class="grow user-card-who">
              <strong class="user-card-name">{{ c.displayName }}</strong>
              <span class="muted small">{{ '@' + c.username }}@if (c.jobTitle) { · {{ c.jobTitle }} }</span>
              @if (c.email) { <a class="small user-card-email" [href]="'mailto:' + c.email">{{ c.email }}</a> }
            </div>
            <span class="role role-{{ c.role.toLowerCase() }}">{{ c.role }}</span>
          </div>

          <div class="user-card-load">
            @if (c.ticketLimit != null) {
              <div class="user-card-load-line">
                <strong [class.danger]="full()">{{ loadPct() }}% loaded</strong>
                <span class="muted small">{{ c.openTickets }} of {{ c.ticketLimit }}</span>
              </div>
              <span class="score-bar" [class.load-bar-full]="full()" role="progressbar" aria-valuemin="0"
                [attr.aria-valuemax]="c.ticketLimit" [attr.aria-valuenow]="c.openTickets"
                [attr.aria-label]="loadPct() + '% of their ticket limit'">
                <span [style.width.%]="barPct()"></span>
              </span>
            } @else {
              <div class="user-card-load-line">
                <strong>{{ c.openTickets }} unfinished</strong>
                <span class="muted small">no limit</span>
              </div>
            }
          </div>

          <dl class="user-card-stats">
            <div><dt>Unfinished</dt><dd>{{ c.openTickets }}</dd></div>
            <div><dt>Closed</dt><dd>{{ c.closedTickets }}</dd></div>
            <div><dt>Total</dt><dd>{{ c.totalAssigned }}</dd></div>
          </dl>

          <div class="user-card-section">
            <span class="section-title">Projects</span>
            @for (p of c.projects; track p.projectId) {
              <div class="user-card-project">
                <span class="id-chip">{{ p.projectCode }}</span>
                <span class="grow user-card-project-name">{{ p.projectName }}</span>
                <span class="muted small">{{ p.role }}</span>
              </div>
            } @empty {
              <p class="muted small">No projects you can see.</p>
            }
          </div>

          <p class="muted small user-card-foot">
            <span class="status-dot" [class.active]="c.isActive"></span>{{ c.isActive ? 'Active' : 'Deactivated' }}
            · member since {{ c.createdAt | date: 'MMM y' }}
          </p>
        } @else if (o.failed) {
          <p class="muted small">Could not load this person's details.</p>
        } @else {
          <div aria-hidden="true">
            <div class="skeleton skeleton-line w-60"></div>
            <div class="skeleton skeleton-line w-80"></div>
            <div class="skeleton skeleton-line w-40"></div>
          </div>
          <p class="sr-only" role="status">Loading…</p>
        }
      </div>
    }
  `,
})
export class UserCardView {
  protected readonly cards = inject(UserCardService);
  protected readonly avatars = inject(AvatarService);
  readonly toneOf = avatarTone;
  readonly initialsOf = initials;

  /** Below the avatar, or above it when there is no room; always inside the window. */
  readonly position = computed(() => {
    const o = this.cards.open();
    if (!o) return { left: 0, top: 0 };
    const gap = 6;
    const left = Math.max(8, Math.min(o.anchor.left, window.innerWidth - CARD_WIDTH - 8));
    const below = o.anchor.bottom + gap;
    const top = below + CARD_HEIGHT > window.innerHeight ? Math.max(8, o.anchor.top - CARD_HEIGHT - gap) : below;
    return { left, top };
  });

  private readonly load = computed(() => {
    const c = this.cards.open()?.card;
    return c && c.ticketLimit ? c.openTickets / c.ticketLimit : 0;
  });
  readonly loadPct = computed(() => Math.round(this.load() * 100));
  /** The bar stops at full; the percentage above it still says 120%. */
  readonly barPct = computed(() => Math.min(100, this.loadPct()));
  readonly full = computed(() => {
    const c = this.cards.open()?.card;
    return !!c && overLimit(c.openTickets, c.ticketLimit, 1);
  });

  // A card left hanging over content that has scrolled away points at nothing. The wheel covers
  // scrolling inside a dialog, which never scrolls the window. A click means the person has moved
  // on — and the top bar's avatar opens the user menu, which the card must not sit on top of.
  @HostListener('window:scroll')
  @HostListener('window:wheel')
  @HostListener('window:resize')
  @HostListener('document:mousedown')
  @HostListener('document:keydown.escape')
  onDismiss() {
    if (this.cards.open()) this.cards.close();
  }
}
