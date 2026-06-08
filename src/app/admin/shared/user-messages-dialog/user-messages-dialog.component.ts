import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';

export interface UserMessagesData {
  userId: string;
  userName: string;
  initialTab?: 'feedback' | 'conversation';
}

@Component({
  selector: 'app-user-messages-dialog',
  templateUrl: './user-messages-dialog.component.html',
  styleUrls: ['./user-messages-dialog.component.scss'],
})
export class UserMessagesDialogComponent implements OnInit {
  activeTab: 'feedback' | 'conversation' = 'feedback';
  feedbacks: any[] = [];
  messages: any[] = [];
  loadingFeedback = false;
  loadingMessages = false;
  newMessage = '';
  sendingMessage = false;

  constructor(
    private adminService: AdminService,
    private toastr: ToastrService,
    public dialogRef: MatDialogRef<UserMessagesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserMessagesData
  ) {
    if (data.initialTab) this.activeTab = data.initialTab;
  }

  ngOnInit(): void {
    this.loadFeedbacks();
    this.loadMessages();
  }

  switchTab(tab: 'feedback' | 'conversation'): void {
    this.activeTab = tab;
  }

  // ── Feedbacks ──────────────────────────────────────────────────────────────

  loadFeedbacks(): void {
    this.loadingFeedback = true;
    this.adminService.getUserFeedbacks(this.data.userId).subscribe({
      next: (res: any) => {
        this.feedbacks = Array.isArray(res) ? res : (res?.value ?? res?.data ?? []);
        this.loadingFeedback = false;
      },
      error: () => {
        this.feedbacks = [];
        this.loadingFeedback = false;
      }
    });
  }

  markFeedback(fb: any, status: string): void {
    this.adminService.updateFeedbackStatus(fb.id, status).subscribe({
      next: () => {
        fb.status = status;
        this.toastr.success(status === 'resolved' ? 'Đã đánh dấu xử lý xong' : 'Đã cập nhật');
      },
      error: () => this.toastr.error('Không thể cập nhật trạng thái')
    });
  }

  getFeedbackIcon(status: string): string {
    switch (status) {
      case 'pending': return 'schedule';
      case 'in_progress': return 'autorenew';
      case 'resolved': return 'check_circle';
      default: return 'help_outline';
    }
  }

  getFeedbackLabel(status: string): string {
    switch (status) {
      case 'pending': return 'Chờ xử lý';
      case 'in_progress': return 'Đang xử lý';
      case 'resolved': return 'Đã xử lý';
      default: return status;
    }
  }

  // ── Conversation ───────────────────────────────────────────────────────────

  loadMessages(): void {
    this.loadingMessages = true;
    this.adminService.getAdminMessages(this.data.userId).subscribe({
      next: (res: any) => {
        this.messages = Array.isArray(res) ? res : (res?.value ?? res?.data ?? []);
        this.loadingMessages = false;
      },
      error: () => {
        this.messages = [];
        this.loadingMessages = false;
      }
    });
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || this.sendingMessage) return;
    this.sendingMessage = true;
    this.adminService.sendAdminMessage(this.data.userId, this.newMessage.trim()).subscribe({
      next: (res: any) => {
        this.messages.push(res?.value ?? res ?? {
          id: Date.now().toString(),
          content: this.newMessage.trim(),
          senderRole: 'admin',
          senderName: 'Admin',
          createdAt: new Date().toISOString(),
        });
        this.newMessage = '';
        this.sendingMessage = false;
      },
      error: () => {
        this.toastr.error('Không thể gửi tin nhắn');
        this.sendingMessage = false;
      }
    });
  }

  isAdminMessage(msg: any): boolean {
    return msg.senderRole === 'admin' || msg.senderRole === 'mod' || msg.senderRole === 'translator' || msg.isAdmin;
  }
}
