import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AdminService } from '../../services/admin.service';

export interface ResetPasswordData {
  userId: string;
  userName: string;
}

@Component({
  selector: 'app-reset-password-dialog',
  templateUrl: './reset-password-dialog.component.html',
  styleUrls: ['./reset-password-dialog.component.scss'],
})
export class ResetPasswordDialogComponent {
  step: 'confirm' | 'result' | 'error' = 'confirm';
  loading = false;
  newPassword = '';
  copied = false;

  constructor(
    public dialogRef: MatDialogRef<ResetPasswordDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ResetPasswordData,
    private adminService: AdminService
  ) {}

  confirm(): void {
    this.loading = true;
    this.adminService.resetPassword(this.data.userId).subscribe({
      next: (res: any) => {
        const result = res?.value ?? res;
        this.newPassword = result?.newPassword ?? result?.password ?? '';
        this.step = 'result';
        this.loading = false;
      },
      error: () => {
        this.step = 'error';
        this.loading = false;
      }
    });
  }

  copyPassword(): void {
    if (!this.newPassword) return;
    navigator.clipboard.writeText(this.newPassword).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }
}
