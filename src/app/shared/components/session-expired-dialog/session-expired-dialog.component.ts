import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

/**
 * Hộp thoại "Phiên đăng nhập đã hết hạn" mở từ RefreshInterceptor khi refresh token
 * cũng hết hạn/không hợp lệ. Đóng trả về:
 *  - true  → người dùng chọn "Đăng nhập" (interceptor điều hướng sang /login),
 *  - false → chọn "Hủy" (ở lại như khách).
 */
@Component({
  selector: 'app-session-expired-dialog',
  template: `
    <div class="session-expired">
      <div class="session-expired__icon">
        <i class="fa-solid fa-clock-rotate-left"></i>
      </div>
      <h2 class="session-expired__title">Phiên đăng nhập đã hết hạn</h2>
      <p class="session-expired__message">
        Phiên đăng nhập của bạn đã hết hạn. Bạn có muốn đăng nhập lại không?
      </p>
      <div class="session-expired__actions">
        <button class="btn btn-secondary" (click)="dialogRef.close(false)">Hủy</button>
        <button class="btn btn-primary" (click)="dialogRef.close(true)">Đăng nhập</button>
      </div>
    </div>
  `,
  styles: [`
    .session-expired {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 28px 24px 22px;
      color: var(--text-primary);
      min-width: 300px;
      box-sizing: border-box;
    }
    .session-expired__icon {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      margin-bottom: 16px;
      background: rgba(233, 69, 96, 0.12);
      color: var(--accent-primary, #e94560);
      font-size: 1.4rem;
    }
    .session-expired__title {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0 0 10px;
      color: var(--text-primary);
    }
    .session-expired__message {
      color: var(--text-secondary);
      margin: 0 0 24px;
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .session-expired__actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      width: 100%;
    }
    .session-expired__actions .btn {
      min-width: 110px;
      padding: 9px 16px;
    }
  `]
})
export class SessionExpiredDialogComponent {
  constructor(public dialogRef: MatDialogRef<SessionExpiredDialogComponent>) {}
}
