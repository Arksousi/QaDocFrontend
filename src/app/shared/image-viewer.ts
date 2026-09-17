import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const WHEEL_STEP = 1.15;
const BUTTON_STEP = 1.3;
/** Zoom level a double-click jumps to, so one gesture gets you into the detail. */
const DOUBLE_CLICK_ZOOM = 2.5;

interface Point {
  x: number;
  y: number;
}

/**
 * Full-screen picture viewer: wheel or pinch to zoom at the pointer, drag to pan, double-click to
 * toggle. Escape is caught in the capture phase so it closes only the viewer, not the dialog behind
 * it. Pointer events are used throughout so touch and mouse follow the same path.
 */
@Component({
  selector: 'app-image-viewer',
  template: `
    <div #surface class="viewer" role="dialog" aria-modal="true" tabindex="-1"
      [attr.aria-label]="alt() || 'Picture'" (pointerdown)="onBackdrop($event)" (wheel)="onWheel($event)">
      <div class="viewer-bar" (pointerdown)="$event.stopPropagation()">
        <span class="viewer-name">{{ alt() || 'Picture' }}</span>
        <span class="grow"></span>
        <button class="icon-btn" (click)="zoomBy(1 / BUTTON_STEP)" [disabled]="zoom() <= MIN_ZOOM"
          title="Zoom out" aria-label="Zoom out">−</button>
        <span class="viewer-zoom" aria-live="polite">{{ percent() }}%</span>
        <button class="icon-btn" (click)="zoomBy(BUTTON_STEP)" [disabled]="zoom() >= MAX_ZOOM"
          title="Zoom in" aria-label="Zoom in">+</button>
        <button class="btn btn-sm btn-ghost" (click)="reset()" [disabled]="zoom() === MIN_ZOOM">Reset</button>
        <button #close class="icon-btn" (click)="closed.emit()" title="Close (Esc)" aria-label="Close">×</button>
      </div>

      <img class="viewer-img" [src]="src()" [alt]="alt()" [style.transform]="transform()" [style.cursor]="cursor()"
        draggable="false" (dblclick)="onDoubleClick($event)"
        (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)" (pointercancel)="onPointerUp($event)" />
    </div>
  `,
})
export class ImageViewer implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('close');

  readonly src = input.required<string>();
  readonly alt = input('');
  readonly closed = output<void>();

  protected readonly MIN_ZOOM = MIN_ZOOM;
  protected readonly MAX_ZOOM = MAX_ZOOM;
  protected readonly BUTTON_STEP = BUTTON_STEP;

  readonly zoom = signal(MIN_ZOOM);
  readonly offset = signal<Point>({ x: 0, y: 0 });
  readonly panning = signal(false);

  readonly percent = computed(() => Math.round(this.zoom() * 100));
  readonly transform = computed(() => {
    const { x, y } = this.offset();
    return `translate(${x}px, ${y}px) scale(${this.zoom()})`;
  });
  readonly cursor = computed(() => (this.panning() ? 'grabbing' : this.zoom() > MIN_ZOOM ? 'grab' : 'zoom-in'));

  /** Live pointers, so one finger pans and two pinch. */
  private readonly pointers = new Map<number, Point>();
  private pinch: { distance: number; zoom: number; midpoint: Point } | null = null;
  private pan: { from: Point; offset: Point } | null = null;
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    // Capture phase: Modal listens for Escape on document, and without this the ticket
    // dialog behind the viewer would close at the same time.
    window.addEventListener('keydown', this.onKeyCapture, true);
  }

  ngAfterViewInit() {
    this.returnFocusTo = document.activeElement as HTMLElement | null;
    this.closeButton().nativeElement.focus({ preventScroll: true });
  }

  ngOnDestroy() {
    window.removeEventListener('keydown', this.onKeyCapture, true);
    this.returnFocusTo?.focus?.({ preventScroll: true });
  }

  private readonly onKeyCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  };

  onBackdrop(event: PointerEvent) {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    this.zoomTo(this.zoom() * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), event.clientX, event.clientY);
  }

  onDoubleClick(event: MouseEvent) {
    event.preventDefault();
    if (this.zoom() > MIN_ZOOM) this.reset();
    else this.zoomTo(DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
  }

  /** Toolbar zoom: no pointer to anchor to, so zoom about the middle of the viewport. */
  zoomBy(factor: number) {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.zoomTo(this.zoom() * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  reset() {
    this.zoom.set(MIN_ZOOM);
    this.offset.set({ x: 0, y: 0 });
  }

  onPointerDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      this.beginPinch();
    } else if (this.pointers.size === 1 && this.zoom() > MIN_ZOOM) {
      this.pan = { from: { x: event.clientX, y: event.clientY }, offset: this.offset() };
      this.panning.set(true);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (!this.pan) return;
    this.offset.set({
      x: this.pan.offset.x + event.clientX - this.pan.from.x,
      y: this.pan.offset.y + event.clientY - this.pan.from.y,
    });
  }

  onPointerUp(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.pan = null;
      this.panning.set(false);
    }
  }

  private beginPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: this.zoom(),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
    this.pan = null;
    this.panning.set(false);
  }

  private updatePinch() {
    if (!this.pinch) return;
    const [a, b] = [...this.pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    this.zoomTo(this.pinch.zoom * (distance / this.pinch.distance), this.pinch.midpoint.x, this.pinch.midpoint.y);
  }

  /**
   * Zooms to an absolute level, keeping the picture point under (clientX, clientY) where it is.
   * The image is centred by the grid, so offsets are measured from the middle of the viewer.
   */
  private zoomTo(target: number, clientX: number, clientY: number) {
    const before = this.zoom();
    const after = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target));
    if (after === before) return;
    if (after === MIN_ZOOM) {
      this.reset();
      return;
    }

    const rect = this.host.nativeElement.getBoundingClientRect();
    const centreX = rect.left + rect.width / 2;
    const centreY = rect.top + rect.height / 2;
    const { x, y } = this.offset();
    const pointX = (clientX - centreX - x) / before;
    const pointY = (clientY - centreY - y) / before;

    this.zoom.set(after);
    this.offset.set({ x: clientX - centreX - pointX * after, y: clientY - centreY - pointY * after });
  }
}
