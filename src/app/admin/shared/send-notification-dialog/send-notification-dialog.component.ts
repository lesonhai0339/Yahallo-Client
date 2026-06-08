import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';

export interface SendNotificationData {
  userId: string;
  userName: string;
}

interface NotifTemplate {
  label: string;
  title: string;
  content: string;
}

@Component({
  selector: 'app-send-notification-dialog',
  templateUrl: './send-notification-dialog.component.html',
  styleUrls: ['./send-notification-dialog.component.scss'],
})
export class SendNotificationDialogComponent {
  form: FormGroup;
  sending = false;
  imagePreview = '';

  templates: NotifTemplate[] = [
    { label: 'Chào mừng', title: 'Chào mừng bạn!', content: 'Cảm ơn bạn đã tham gia cộng đồng Yahallo. Chúc bạn có trải nghiệm đọc truyện tuyệt vời!' },
    { label: 'Cảnh báo vi phạm', title: 'Cảnh báo vi phạm', content: 'Tài khoản của bạn đã vi phạm quy tắc cộng đồng. Vui lòng xem lại nội quy để tránh bị hạn chế tài khoản.' },
    { label: 'Cập nhật hệ thống', title: 'Thông báo bảo trì', content: 'Hệ thống sẽ được bảo trì vào [thời gian]. Vui lòng lưu lại tiến trình đọc trước thời gian trên.' },
    { label: 'Phản hồi feedback', title: 'Phản hồi từ Admin', content: 'Cảm ơn bạn đã gửi phản hồi. Chúng tôi đã xem xét và sẽ cải thiện trong thời gian sớm nhất.' },
  ];

  constructor(
    private fb: FormBuilder,
    private adminService: AdminService,
    private toastr: ToastrService,
    public dialogRef: MatDialogRef<SendNotificationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SendNotificationData
  ) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: ['', [Validators.required, Validators.maxLength(2000)]],
      imageUrl: [''],
    });
  }

  applyTemplate(t: NotifTemplate): void {
    this.form.patchValue({ title: t.title, content: t.content });
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    this.imagePreview = URL.createObjectURL(file);
    this.form.patchValue({ imageUrl: this.imagePreview });
  }

  removeImage(): void {
    if (this.imagePreview) URL.revokeObjectURL(this.imagePreview);
    this.imagePreview = '';
    this.form.patchValue({ imageUrl: '' });
  }

  send(): void {
    if (this.form.invalid || this.sending) return;
    this.sending = true;
    const { title, content, imageUrl } = this.form.value;
    this.adminService.sendNotification(this.data.userId, { title, content, imageUrl: imageUrl || undefined }).subscribe({
      next: () => {
        this.toastr.success('Đã gửi thông báo');
        this.dialogRef.close(true);
      },
      error: () => {
        this.toastr.error('Không thể gửi thông báo');
        this.sending = false;
      }
    });
  }
}
