import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import { CreateTopicDialogComponent } from '../../shared/create-topic-dialog/create-topic-dialog.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

interface TopicReply {
  id: string;
  topicId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar: string | null;
  createdAt: string;
}

interface Topic {
  id: string;
  title: string;
  content: string;
  category: string;
  pinned: boolean;
  closed: boolean;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar: string | null;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
}

@Component({
  selector: 'app-topic-list',
  templateUrl: './topic-list.component.html',
  styleUrls: ['./topic-list.component.scss']
})
export class TopicListComponent implements OnInit {
  topics: Topic[] = [];
  filteredTopics: Topic[] = [];
  selectedTopic: Topic | null = null;
  replies: TopicReply[] = [];

  loading = false;
  loadingReplies = false;
  sendingReply = false;
  replyText = '';
  searchText = '';
  activeCategory = '';

  categories = [
    { value: '', label: 'Tất cả', icon: 'list' },
    { value: 'announcement', label: 'Thông báo', icon: 'campaign' },
    { value: 'policy', label: 'Chính sách', icon: 'gavel' },
    { value: 'discussion', label: 'Thảo luận', icon: 'forum' },
    { value: 'question', label: 'Hỏi đáp', icon: 'help_outline' },
  ];

  constructor(
    private adminService: AdminService,
    private auth: AuthService,
    public perm: PermissionService,
    private dialog: MatDialog,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadTopics();
  }

  loadTopics(): void {
    this.loading = true;
    this.adminService.getTopics().subscribe({
      next: (res: any) => {
        const data = res?.value ?? res;
        this.topics = (Array.isArray(data) ? data : data?.items ?? []).map((t: any) => ({
          ...t,
          replyCount: t.replyCount ?? 0,
          pinned: t.pinned ?? false,
          closed: t.closed ?? false,
        }));
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Không thể tải danh sách topic');
      }
    });
  }

  applyFilters(): void {
    let result = [...this.topics];

    if (this.activeCategory) {
      result = result.filter(t => t.category === this.activeCategory);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.authorName.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

    this.filteredTopics = result;
  }

  filterByCategory(cat: string): void {
    this.activeCategory = cat;
    this.applyFilters();
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  selectTopic(topic: Topic): void {
    if (this.selectedTopic?.id === topic.id) {
      this.selectedTopic = null;
      this.replies = [];
      return;
    }
    this.selectedTopic = topic;
    this.loadReplies(topic.id);
  }

  loadReplies(topicId: string): void {
    this.loadingReplies = true;
    this.replies = [];
    this.adminService.getTopicReplies(topicId).subscribe({
      next: (res: any) => {
        this.replies = Array.isArray(res) ? res : (res?.value ?? []);
        this.loadingReplies = false;
      },
      error: () => {
        this.loadingReplies = false;
      }
    });
  }

  sendReply(): void {
    if (!this.replyText.trim() || !this.selectedTopic || this.sendingReply) return;
    this.sendingReply = true;
    this.adminService.createTopicReply(this.selectedTopic.id, this.replyText.trim()).subscribe({
      next: (res: any) => {
        const reply = res?.value ?? res;
        if (reply) this.replies.push(reply);
        this.replyText = '';
        this.sendingReply = false;
        if (this.selectedTopic) {
          this.selectedTopic.replyCount++;
          this.selectedTopic.lastActivityAt = new Date().toISOString();
        }
      },
      error: () => {
        this.sendingReply = false;
        this.toastr.error('Gửi phản hồi thất bại');
      }
    });
  }

  onReplyKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendReply();
    }
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateTopicDialogComponent, {
      width: '580px',
      maxWidth: '95vw',
      data: { canPin: this.perm.isAdmin }
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.topics.unshift(result);
        this.applyFilters();
        this.toastr.success('Đã tạo topic mới');
      }
    });
  }

  togglePin(topic: Topic): void {
    this.adminService.toggleTopicPin(topic.id, !topic.pinned).subscribe({
      next: () => {
        topic.pinned = !topic.pinned;
        this.applyFilters();
        this.toastr.success(topic.pinned ? 'Đã ghim topic' : 'Đã bỏ ghim');
      },
      error: () => this.toastr.error('Thao tác thất bại')
    });
  }

  toggleClose(topic: Topic): void {
    this.adminService.toggleTopicClose(topic.id, !topic.closed).subscribe({
      next: () => {
        topic.closed = !topic.closed;
        this.toastr.success(topic.closed ? 'Đã đóng topic' : 'Đã mở lại topic');
      },
      error: () => this.toastr.error('Thao tác thất bại')
    });
  }

  deleteTopic(topic: Topic): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Xóa topic',
        message: `Xác nhận xóa topic "${topic.title}"? Tất cả phản hồi sẽ bị xóa.`,
        confirmText: 'Xóa',
        danger: true
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.adminService.deleteTopic(topic.id).subscribe({
        next: () => {
          this.topics = this.topics.filter(t => t.id !== topic.id);
          this.applyFilters();
          if (this.selectedTopic?.id === topic.id) {
            this.selectedTopic = null;
            this.replies = [];
          }
          this.toastr.success('Đã xóa topic');
        },
        error: () => this.toastr.error('Không thể xóa topic')
      });
    });
  }

  getCategoryLabel(cat: string): string {
    return this.categories.find(c => c.value === cat)?.label ?? cat;
  }

  getCategoryIcon(cat: string): string {
    return this.categories.find(c => c.value === cat)?.icon ?? 'label';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  isOwnTopic(topic: Topic): boolean {
    return topic.authorId === this.auth.currentUser?.id;
  }

  canManageTopic(topic: Topic): boolean {
    return this.perm.isAdmin || this.isOwnTopic(topic);
  }

  getRoleBadgeClass(role: string): string {
    switch (role?.toLowerCase()) {
      case 'admin': return 'role--admin';
      case 'moderator': return 'role--mod';
      case 'trans': return 'role--trans';
      default: return '';
    }
  }
}
