import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="confirm-dialog">
      <h2 class="confirm-dialog__title">{{ data.title }}</h2>
      <p class="confirm-dialog__message">{{ data.message }}</p>
      <div class="confirm-dialog__actions">
        <button class="btn btn-secondary" (click)="dialogRef.close(false)">
          {{ data.cancelText || 'Hủy' }}
        </button>
        <button
          class="btn"
          [class.btn-danger]="data.danger !== false"
          [class.btn-primary]="data.danger === false"
          (click)="dialogRef.close(true)">
          {{ data.confirmText || 'Xác nhận' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      padding: 8px 4px;
      &__title { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; color: var(--text-primary); }
      &__message { color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem; }
      &__actions { display: flex; gap: 10px; justify-content: flex-end; }
    }
    .btn-danger { background: #dc3545; border-color: #dc3545; color: white; }
    .btn-danger:hover { background: #c82333; }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}
}
