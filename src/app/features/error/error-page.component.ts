import { Component, Inject, Input, OnInit, Optional } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RESPONSE_CONTEXT, ResponseContext } from '../../core/tokens/response-context';

/**
 * Trang lỗi dùng chung cho 404 và 503 — nội dung lấy từ `data` của route thay
 * vì nhân bản component. Xem `app-routing.module.ts` để biết route nào truyền gì.
 *
 * Dùng được theo 2 cách:
 * - **Là route** (`server-error`, `**`): nội dung đọc từ `route.data`.
 * - **Nhúng trong trang khác**: truyền qua `@Input()`, ví dụ `MangaDetailComponent`
 *   hiện "không tìm thấy truyện" mà vẫn ở nguyên URL `/manga/:id`. Lúc này
 *   `@Input()` được ưu tiên hơn `route.data`.
 */
@Component({
  selector: 'app-error-page',
  template: `
    <div class="error-page">
      <div class="error-card">
        <i class="{{ icon }} error-icon"></i>
        <h1>{{ code }}</h1>
        <h2>{{ titleKey | translate }}</h2>
        <p>{{ descKey | translate }}</p>
        <div class="error-actions">
          <button class="btn btn-primary" *ngIf="showRetry" (click)="retry()">
            <i class="fa-solid fa-rotate-right me-2"></i>{{ 'ERROR.RETRY' | translate }}
          </button>
          <a class="btn btn-secondary" routerLink="/">
            <i class="fa-solid fa-house me-2"></i>{{ 'ERROR.BACK_HOME' | translate }}
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .error-page {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .error-card {
      text-align: center;
      max-width: 480px;
    }

    .error-icon {
      font-size: 4rem;
      color: var(--accent-primary);
      margin-bottom: 16px;
    }

    h1 {
      font-size: 4rem;
      font-weight: 800;
      color: var(--text-primary);
      margin: 0;
      line-height: 1;
    }

    h2 {
      font-size: 1.3rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 12px 0;
    }

    p {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .error-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
  `]
})
export class ErrorPageComponent implements OnInit {
  @Input() code = '';
  @Input() titleKey = '';
  @Input() descKey = '';
  @Input() icon = '';
  /** Nút "Thử lại" chỉ hợp lý khi lỗi có thể tự hết (503). Với 404 thì tắt đi. */
  @Input() showRetry = true;

  constructor(
    private route: ActivatedRoute,
    @Optional() @Inject(RESPONSE_CONTEXT) private responseContext: ResponseContext | null,
  ) {}

  /**
   * Chức năng: Chốt nội dung hiển thị theo thứ tự `@Input()` → `route.data` →
   *   mặc định, và khi đang render ở server thì báo mã HTTP ra ngoài. Không báo
   *   thì Express trả 200 cho cả trang 404 — Google coi là trang hợp lệ (soft 404).
   *   Đọc ở `ngOnInit` chứ không phải constructor vì `@Input()` chưa có giá trị
   *   lúc constructor chạy.
   * Yêu cầu: khi dùng làm route thì `route.data` cần `code`/`titleKey`/`descKey`/
   *   `icon`, thêm `status` nếu muốn đổi mã HTTP. Khi nhúng thì truyền `@Input()`.
   * Kết quả trả về: không (gán field hiển thị, ghi vào `ResponseContext`).
   * Exception: không ném — thiếu hết thì rơi về mặc định 500; phía trình duyệt
   *   không có `RESPONSE_CONTEXT` nên bỏ qua bước báo status.
   */
  ngOnInit(): void {
    const data = this.route.snapshot.data;
    this.code = this.code || data['code'] || '500';
    this.titleKey = this.titleKey || data['titleKey'] || 'ERROR.SERVER_DOWN';
    this.descKey = this.descKey || data['descKey'] || 'ERROR.SERVER_DOWN_DESC';
    this.icon = this.icon || data['icon'] || 'fa-solid fa-server';

    // Chỉ ghi khi chưa ai ghi: nhiều component cùng render thì thằng sau không
    // được đè mã của thằng trước.
    if (this.responseContext && data['status'] && this.responseContext.status === 200) {
      this.responseContext.status = data['status'];
    }
  }

  /** Tải lại từ trang chủ — chỉ chạy khi người dùng bấm, nên luôn ở phía client. */
  retry(): void {
    window.location.href = '/';
  }
}
