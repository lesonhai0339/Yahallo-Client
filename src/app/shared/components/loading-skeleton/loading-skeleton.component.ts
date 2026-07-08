import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  template: `
    <div class="skeleton-grid" [ngStyle]="{'--cols': cols}">
      <div class="skeleton-card" *ngFor="let i of items">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton skeleton-title mt-2"></div>
        <div class="skeleton skeleton-meta mt-1"></div>
      </div>
    </div>
  `,
  styles: [`
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(var(--cols, 6), 1fr);
      gap: 16px;
    }
    .skeleton-img { aspect-ratio: 2/3; width: 100%; border-radius: 8px; }
    .skeleton-title { height: 14px; width: 90%; border-radius: 4px; }
    .skeleton-meta { height: 12px; width: 60%; border-radius: 4px; }
    @media (max-width: 992px) { .skeleton-grid { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 768px) { .skeleton-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 480px) { .skeleton-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class LoadingSkeletonComponent {
  @Input() count = 12;
  @Input() cols = 6;
  // Coerce: count can arrive as a string (e.g. pageSize hydrated from stored/server
  // prefs). Array('20') → 1 phần tử, nên ép về số nguyên dương, fallback 12.
  get items() {
    const n = Math.floor(Number(this.count));
    return Array(n > 0 ? n : 12).fill(0);
  }
}
