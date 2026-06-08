import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-create-topic-dialog',
  templateUrl: './create-topic-dialog.component.html',
  styleUrls: ['./create-topic-dialog.component.scss']
})
export class CreateTopicDialogComponent {
  title = '';
  content = '';
  category = 'discussion';
  pinned = false;
  saving = false;

  categories = [
    { value: 'announcement', label: 'Thông báo', icon: 'campaign' },
    { value: 'policy', label: 'Chính sách', icon: 'gavel' },
    { value: 'discussion', label: 'Thảo luận', icon: 'forum' },
    { value: 'question', label: 'Hỏi đáp', icon: 'help_outline' },
  ];

  constructor(
    private dialogRef: MatDialogRef<CreateTopicDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { canPin: boolean },
    private adminService: AdminService,
    private toastr: ToastrService
  ) {}

  get canSubmit(): boolean {
    return this.title.trim().length > 0 && this.content.trim().length > 0;
  }

  submit(): void {
    if (!this.canSubmit || this.saving) return;
    this.saving = true;

    const payload = {
      title: this.title.trim(),
      content: this.content.trim(),
      category: this.category,
      pinned: this.pinned,
    };

    this.adminService.createTopic(payload).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.dialogRef.close(res?.value ?? res);
      },
      error: () => {
        this.saving = false;
        this.toastr.error('Không thể tạo topic');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
