import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

/**
 * Dialog xác nhận dùng CHUNG cho toàn bộ admin (manga-list, user-list, topic-list,
 * taxonomy-list, chapter-list, role-list, comment-moderation).
 *
 * `icon` và `preview` là TUỲ CHỌN — mọi caller cũ chỉ truyền title/message/
 * confirmText vẫn chạy y như trước, chỉ đẹp hơn.
 */
export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Mặc định coi như hành động phá huỷ (nút đỏ). Truyền `false` để dùng nút accent. */
  danger?: boolean;
  /** Tên material icon hiển thị trong badge. Mặc định theo `danger`. */
  icon?: string;
  /** Trích đoạn nội dung sẽ bị ảnh hưởng (vd nội dung comment sắp xoá). */
  preview?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="cd" [class.cd--danger]="isDanger" [class.cd--safe]="!isDanger">
      <div class="cd__head">
        <span class="cd__badge">
          <span class="material-icons">{{ iconName }}</span>
        </span>
        <div class="cd__text">
          <h2 class="cd__title">{{ data.title }}</h2>
          <p class="cd__message">{{ data.message }}</p>
        </div>
      </div>

      <blockquote class="cd__preview" *ngIf="data.preview">
        {{ data.preview }}
      </blockquote>

      <div class="cd__actions">
        <!-- Focus mặc định ở "Huỷ": hành động phá huỷ không nên nhận Enter ngay. -->
        <button type="button" class="cd-btn cd-btn--ghost" cdkFocusInitial
                (click)="dialogRef.close(false)">
          {{ data.cancelText || 'Huỷ' }}
        </button>
        <button type="button" class="cd-btn cd-btn--solid"
                (click)="dialogRef.close(true)">
          <span class="material-icons">{{ isDanger ? 'delete_forever' : 'check' }}</span>
          {{ data.confirmText || 'Xác nhận' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Padding do .mdc-dialog__surface quản (xem override trong styles.scss),
       ở đây để 0 để không cộng dồn thành viền trong quá dày. */
    .cd {
      --cd-accent: var(--accent-primary);
      padding: 0;
      color: var(--text-primary);
      max-width: 440px;
    }
    .cd--danger { --cd-accent: #e5484d; }

    .cd__head { display: flex; gap: 14px; align-items: flex-start; }

    /* Badge icon: vòng tròn nền nhạt cùng tông với nút xác nhận.
       Nền đặt rời theo từng variant (không dùng color-mix để khỏi phụ thuộc
       browser mới — --cd-accent là biến nên rgba() không suy ra được). */
    .cd__badge {
      flex: none;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--cd-accent);
    }
    .cd--danger .cd__badge { background: rgba(229, 72, 77, 0.15); }
    .cd--safe .cd__badge { background: rgba(233, 69, 96, 0.15); }
    .cd__badge .material-icons { font-size: 1.35rem; }

    .cd__text { min-width: 0; padding-top: 2px; }

    .cd__title {
      font-size: 1.08rem;
      font-weight: 700;
      line-height: 1.35;
      margin: 0 0 6px;
      color: var(--text-primary);
    }
    .cd__message {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.55;
      color: var(--text-secondary);
      overflow-wrap: anywhere;
    }

    /* Trích đoạn nội dung bị ảnh hưởng — cắt bớt nếu quá dài. */
    .cd__preview {
      margin: 14px 0 0;
      padding: 10px 12px;
      border-left: 3px solid var(--cd-accent);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      background: var(--bg-secondary);
      font-size: 0.84rem;
      line-height: 1.5;
      color: var(--text-secondary);
      font-style: italic;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 108px;
      overflow-y: auto;
    }
    .cd__preview::-webkit-scrollbar { width: 4px; }
    .cd__preview::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 2px; }

    .cd__actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid var(--border-color);
    }

    .cd-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: filter .15s, background .15s, border-color .15s, color .15s;
    }
    .cd-btn .material-icons { font-size: 1.05rem; }

    .cd-btn--ghost {
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
    }
    .cd-btn--ghost:hover { border-color: var(--border-light); color: var(--text-primary); }

    .cd-btn--solid {
      border: 1px solid var(--cd-accent);
      background: var(--cd-accent);
      color: #fff;
    }
    .cd-btn--solid:hover { filter: brightness(1.1); }
    .cd-btn--solid:focus-visible {
      outline: 2px solid var(--cd-accent);
      outline-offset: 2px;
    }

    @media (max-width: 480px) {
      .cd__actions { flex-direction: column-reverse; }
      .cd-btn { width: 100%; justify-content: center; }
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  /** Giữ hành vi cũ: chỉ khi truyền `danger: false` mới là hành động an toàn. */
  get isDanger(): boolean {
    return this.data.danger !== false;
  }

  get iconName(): string {
    return this.data.icon || (this.isDanger ? 'warning_amber' : 'help_outline');
  }
}
