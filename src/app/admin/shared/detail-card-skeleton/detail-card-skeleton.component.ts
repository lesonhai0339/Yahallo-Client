import { Component, Input } from '@angular/core';

/**
 * Skeleton placeholder cho detail card bên phải (manga-card / user-card ở admin)
 * trong lúc gọi API chi tiết. `variant`:
 *  - 'cover'  → khối ảnh 2:3 (manga)
 *  - 'avatar' → khối tròn (user)
 * Dùng class `.skeleton` toàn cục (shimmer) trong styles.scss.
 */
@Component({
  selector: 'app-detail-card-skeleton',
  template: `
    <div class="dsk">
      <div class="skeleton dsk__media" [class.dsk__media--round]="variant === 'avatar'"></div>
      <div class="skeleton dsk__title"></div>
      <div class="skeleton dsk__sub"></div>
      <div class="dsk__rows">
        <div class="dsk__row" *ngFor="let i of rows">
          <div class="skeleton dsk__icon"></div>
          <div class="dsk__lines">
            <div class="skeleton dsk__l1"></div>
            <div class="skeleton dsk__l2"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dsk { display: flex; flex-direction: column; align-items: center; width: 100%; padding: 8px 4px; }
    .dsk__media { width: 120px; height: 180px; border-radius: 8px; }
    .dsk__media--round { width: 96px; height: 96px; border-radius: 50%; }
    .dsk__title { height: 18px; width: 60%; margin-top: 14px; }
    .dsk__sub { height: 12px; width: 35%; margin-top: 8px; }
    .dsk__rows { width: 100%; margin-top: 18px; display: flex; flex-direction: column; gap: 14px; }
    .dsk__row { display: flex; align-items: center; gap: 10px; }
    .dsk__icon { width: 20px; height: 20px; flex: none; }
    .dsk__lines { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .dsk__l1 { height: 9px; width: 40%; }
    .dsk__l2 { height: 12px; width: 75%; }

    @media (max-width: 768px) {
      .dsk__media { width: 96px; height: 144px; }
      .dsk__media--round { width: 72px; height: 72px; }
      .dsk__rows { margin-top: 14px; gap: 11px; }
    }
  `],
})
export class DetailCardSkeletonComponent {
  @Input() variant: 'cover' | 'avatar' = 'cover';
  @Input() lines = 5;
  get rows(): number[] { return Array(this.lines).fill(0); }
}
