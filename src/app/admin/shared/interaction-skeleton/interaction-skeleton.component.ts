import { Component, Input } from '@angular/core';

/**
 * Khung xương cho danh sách tương tác (người theo dõi / bình luận) ở khu quản trị.
 *
 * Kích thước dựng bám sát `.ilist__row` thật — avatar 36px tròn, cùng khoảng
 * đệm và cùng số dòng chữ — để lúc dữ liệu về không co giãn rồi nhảy layout.
 * Sửa `.ilist` bên `manga-info.component.scss` thì phải soát lại file này.
 */
@Component({
  selector: 'app-interaction-skeleton',
  template: `
    <ul class="isk">
      <li class="isk__row" [class.isk__row--comment]="variant === 'comment'"
        *ngFor="let i of rowList">
        <div class="skeleton isk__avatar"></div>

        <div class="isk__body">
          <div class="skeleton isk__line isk__line--name"></div>

          <ng-container *ngIf="variant === 'comment'; else followLines">
            <div class="skeleton isk__line isk__line--msg"></div>
            <div class="skeleton isk__line isk__line--sub"></div>
          </ng-container>
          <ng-template #followLines>
            <div class="skeleton isk__line isk__line--id"></div>
          </ng-template>
        </div>

        <div class="skeleton isk__line isk__line--meta" *ngIf="variant === 'follow'"></div>
      </li>
    </ul>
  `,
  styles: [`
    .isk { list-style: none; margin: 0; padding: 0; }

    .isk__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;

      & + & { border-top: 1px solid var(--border-color); }
      &--comment { align-items: flex-start; }
    }

    .isk__avatar {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      border-radius: 50%;
    }

    .isk__body { flex: 1; min-width: 0; }

    .isk__line {
      height: 12px;
      border-radius: 4px;

      &--name { width: 38%; }
      &--id   { width: 62%; height: 9px; margin-top: 6px; }
      &--msg  { width: 88%; margin-top: 7px; }
      &--sub  { width: 30%; height: 9px; margin-top: 7px; }
      &--meta { width: 108px; flex-shrink: 0; }
    }

    /* Bám theo .ilist__row ở manga-info.component.scss: cùng ngưỡng 600px,
       cột thời gian xuống hàng riêng thụt vào 48px (không phải bị ẩn). */
    @media (max-width: 600px) {
      .isk__row { flex-wrap: wrap; gap: 10px; }
      .isk__line--meta { width: calc(100% - 48px); margin-left: 48px; }
    }
  `],
})
export class InteractionSkeletonComponent {
  /** Dáng dòng: 'follow' có cột thời gian bên phải, 'comment' có dòng nội dung. */
  @Input() variant: 'follow' | 'comment' = 'follow';

  /**
   * Số dòng khung xương. Là property thường (không getter) vì `*ngFor` nhận
   * mảng — getter trả mảng mới mỗi vòng change-detection sẽ dựng lại cả danh sách.
   */
  @Input() set rows(n: number) {
    this.rowList = new Array(Math.max(1, n)).fill(0);
  }

  rowList: number[] = new Array(10).fill(0);
}
