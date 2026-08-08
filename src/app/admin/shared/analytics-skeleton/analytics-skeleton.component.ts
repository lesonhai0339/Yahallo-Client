import { Component, Input } from '@angular/core';

/**
 * Skeleton placeholder cho các trang thống kê (`manga-analytics`, `user-analytics`,
 * khối biểu đồ ở `dashboard`) trong lúc gọi API — thay cho spinner tròn.
 *
 * Khung dựng lại đúng bố cục thật: tiêu đề nhóm → hàng mini-stat → các thẻ biểu đồ,
 * nên nội dung thật đổ vào không làm nhảy layout.
 *
 * `statRows`: số hàng mini-stat (analytics có 2 khối: toàn thời gian + theo range).
 * `stats`: số ô trong mỗi hàng. `charts`: số thẻ biểu đồ. `chartCols`: 1 hoặc 2 cột.
 * Dùng class `.skeleton` toàn cục (shimmer) ở styles.scss.
 */
@Component({
  selector: 'app-analytics-skeleton',
  template: `
    <div class="ask">
      <ng-container *ngFor="let r of statRowList">
        <div class="skeleton ask__section-title"></div>
        <div class="ask__stats">
          <div class="ask__stat" *ngFor="let s of statList">
            <div class="skeleton ask__stat-icon"></div>
            <div class="ask__stat-body">
              <div class="skeleton ask__stat-value"></div>
              <div class="skeleton ask__stat-label"></div>
            </div>
          </div>
        </div>
      </ng-container>

      <div class="ask__charts" [class.ask__charts--two]="chartCols === 2">
        <div class="ask__chart" *ngFor="let c of chartList">
          <div class="ask__chart-head">
            <div class="skeleton ask__chart-title"></div>
            <div class="skeleton ask__chart-toggle"></div>
          </div>
          <div class="ask__chart-body">
            <div class="skeleton ask__bar"
                 *ngFor="let b of barList; let i = index"
                 [style.height.%]="barHeight(i)"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ask { display: flex; flex-direction: column; width: 100%; }

    .ask__section-title { height: 14px; width: 140px; margin: 18px 0 12px; border-radius: 4px; }
    .ask:first-child .ask__section-title:first-child { margin-top: 0; }

    .ask__stats { display: flex; flex-wrap: wrap; gap: 12px; }
    .ask__stat {
      flex: 1 1 150px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm, 6px);
      background: var(--bg-card);
    }
    .ask__stat-icon { flex: none; width: 26px; height: 26px; border-radius: 6px; }
    .ask__stat-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
    .ask__stat-value { height: 16px; width: 55%; border-radius: 4px; }
    .ask__stat-label { height: 10px; width: 80%; border-radius: 4px; }

    .ask__charts { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 20px; }
    .ask__charts--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (max-width: 900px) { .ask__charts--two { grid-template-columns: 1fr; } }

    .ask__chart {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm, 6px);
      background: var(--bg-card);
      padding: 14px;
    }
    .ask__chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .ask__chart-title { height: 13px; width: 160px; border-radius: 4px; }
    .ask__chart-toggle { height: 26px; width: 84px; border-radius: 6px; }

    /* Cột giả cao thấp so le — gợi hình biểu đồ, không phải khối chữ nhật đặc. */
    .ask__chart-body {
      margin-top: 16px;
      height: 190px;
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .ask__bar { flex: 1; min-width: 0; border-radius: 4px 4px 0 0; }

    @media (max-width: 768px) {
      .ask__stats { gap: 8px; }
      .ask__stat { flex: 1 1 calc(50% - 4px); padding: 10px; }
      .ask__chart { padding: 12px; }
      .ask__chart-title { width: 110px; }
      .ask__chart-body { height: 150px; gap: 5px; }
    }

    /* Điện thoại hẹp: cột giả sát nhau dễ thành vệt liền — bớt số cột thấy được. */
    @media (max-width: 480px) {
      .ask__stat { flex: 1 1 100%; }
      .ask__chart-body { height: 120px; gap: 4px; }
      .ask__bar:nth-child(n + 9) { display: none; }
    }
  `],
})
export class AnalyticsSkeletonComponent {
  @Input() statRows = 1;
  @Input() stats = 4;
  @Input() charts = 1;
  @Input() chartCols: 1 | 2 = 1;
  /** Số cột giả trong mỗi biểu đồ. */
  @Input() bars = 12;

  get statRowList(): number[] { return Array(this.statRows).fill(0); }
  get statList(): number[] { return Array(this.stats).fill(0); }
  get chartList(): number[] { return Array(this.charts).fill(0); }
  get barList(): number[] { return Array(this.bars).fill(0); }

  /**
   * Chức năng: sinh chiều cao so le cho cột giả để khung trông giống biểu đồ thật.
   * Yêu cầu: `index` — vị trí cột trong hàng, từ 0.
   * Kết quả trả về: phần trăm chiều cao (30–95) so với thân biểu đồ.
   * Exception: không ném — index vượt mảng thì lặp lại theo chu kỳ.
   */
  barHeight(index: number): number {
    const heights = [45, 70, 38, 88, 55, 62, 30, 78, 50, 95, 42, 68];
    return heights[index % heights.length];
  }
}
