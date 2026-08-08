import { Component, Input } from '@angular/core';

/**
 * Skeleton placeholder cho form 2 cột ở admin (`manga-form`) trong lúc nạp dữ liệu
 * bản ghi cần sửa — thay cho dòng chữ "Đang tải dữ liệu...".
 *
 * Dựng lại đúng lưới `240px 1fr` của `.form-layout`: cột trái là ô ảnh bìa,
 * cột phải là các khối `.form-section` với vài trường giả mỗi khối.
 * Dùng class `.skeleton` toàn cục (shimmer) ở styles.scss.
 */
@Component({
  selector: 'app-form-skeleton',
  template: `
    <div class="fsk">
      <div class="fsk__side">
        <div class="fsk__box">
          <div class="skeleton fsk__title"></div>
          <div class="skeleton fsk__cover"></div>
          <div class="skeleton fsk__btn"></div>
        </div>
      </div>

      <div class="fsk__main">
        <div class="fsk__box" *ngFor="let s of sectionList">
          <div class="skeleton fsk__title"></div>
          <div class="fsk__field" *ngFor="let f of fieldList; let i = index">
            <div class="skeleton fsk__label"></div>
            <div class="skeleton fsk__input" [class.fsk__input--tall]="i === 1"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .fsk { display: grid; grid-template-columns: 240px 1fr; gap: 20px; align-items: start; }
    @media (max-width: 1100px) { .fsk { grid-template-columns: 1fr; } }

    .fsk__side, .fsk__main { display: flex; flex-direction: column; gap: 16px; }

    .fsk__box {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md, 8px);
      padding: 20px;
    }

    .fsk__title { height: 13px; width: 42%; margin-bottom: 16px; border-radius: 4px; }

    /* Ô ảnh bìa tỉ lệ 2:3, khớp .image-upload-area của form thật. */
    .fsk__cover { width: 100%; aspect-ratio: 2 / 3; border-radius: 6px; }
    .fsk__btn { height: 32px; width: 100%; margin-top: 12px; border-radius: 6px; }

    .fsk__field { margin-bottom: 16px; }
    .fsk__field:last-child { margin-bottom: 0; }
    .fsk__label { height: 10px; width: 28%; margin-bottom: 8px; border-radius: 4px; }
    .fsk__input { height: 38px; width: 100%; border-radius: 6px; }
    .fsk__input--tall { height: 86px; }

    @media (max-width: 1100px) {
      /* Một cột: ảnh bìa full-width sẽ cao lố màn hình → kẹp lại và căn giữa. */
      .fsk__cover { max-width: 200px; margin: 0 auto; }
      .fsk__btn { max-width: 200px; margin-left: auto; margin-right: auto; }
    }

    @media (max-width: 768px) {
      .fsk { gap: 14px; }
      .fsk__box { padding: 14px; }
      .fsk__field { margin-bottom: 12px; }
      .fsk__input { height: 34px; }
      .fsk__input--tall { height: 70px; }
    }
  `],
})
export class FormSkeletonComponent {
  /** Số khối `.form-section` giả ở cột phải. */
  @Input() sections = 3;
  /** Số trường giả trong mỗi khối. */
  @Input() fields = 3;

  get sectionList(): number[] { return Array(this.sections).fill(0); }
  get fieldList(): number[] { return Array(this.fields).fill(0); }
}
