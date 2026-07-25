import { Component, Input } from '@angular/core';

/**
 * Skeleton placeholder cho danh sách ở admin, thay cho spinner tròn.
 *
 * `variant`:
 *  - 'table' → các hàng bảng (desktop, dùng cạnh mat-table)
 *  - 'card'  → các card xếp dọc (mobile card-list)
 *
 * `leading`: khối đứng đầu mỗi hàng — 'none' | 'cover' (ảnh truyện 2:3) |
 * 'avatar' (tròn, user). Dùng class `.skeleton` toàn cục (shimmer) ở styles.scss.
 */
@Component({
  selector: 'app-table-skeleton',
  template: `
    <div class="tsk" [class.tsk--card]="variant === 'card'">
      <div class="tsk__row" *ngFor="let r of rowList">
        <div class="skeleton tsk__lead"
             *ngIf="leading !== 'none'"
             [class.tsk__lead--cover]="leading === 'cover'"
             [class.tsk__lead--avatar]="leading === 'avatar'"></div>

        <div class="tsk__cells">
          <div class="skeleton tsk__cell"
               *ngFor="let c of colList; let i = index"
               [style.width.%]="cellWidth(i)"></div>
        </div>

        <div class="skeleton tsk__action" *ngIf="showActions"></div>
      </div>
    </div>
  `,
  styles: [`
    .tsk { display: flex; flex-direction: column; width: 100%; }

    .tsk__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
    }
    .tsk__row:last-child { border-bottom: none; }

    /* Biến thể card: mỗi hàng là một thẻ riêng, có viền + nền. */
    .tsk--card .tsk__row {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm, 6px);
      background: var(--bg-card);
      margin-bottom: 8px;
    }
    .tsk--card .tsk__row:last-child { margin-bottom: 0; }

    .tsk__lead { flex: none; width: 34px; height: 34px; border-radius: 6px; }
    .tsk__lead--cover { width: 34px; height: 48px; }
    .tsk__lead--avatar { width: 36px; height: 36px; border-radius: 50%; }

    .tsk__cells { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
    .tsk__cell { height: 11px; border-radius: 4px; }

    .tsk__action { flex: none; width: 64px; height: 26px; border-radius: 6px; }
  `],
})
export class TableSkeletonComponent {
  @Input() variant: 'table' | 'card' = 'table';
  @Input() leading: 'none' | 'cover' | 'avatar' = 'none';
  @Input() rows = 6;
  /** Số dòng "chữ" giả trong mỗi hàng. */
  @Input() cols = 2;
  @Input() showActions = true;

  get rowList(): number[] { return Array(this.rows).fill(0); }
  get colList(): number[] { return Array(this.cols).fill(0); }

  /** Độ rộng so le cho từng dòng để trông tự nhiên hơn khối chữ nhật đều nhau. */
  cellWidth(index: number): number {
    const widths = [72, 45, 58, 38];
    return widths[index % widths.length];
  }
}
