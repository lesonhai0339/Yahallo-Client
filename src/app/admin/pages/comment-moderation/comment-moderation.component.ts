import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AdminModerationService, AdminComment } from '../../services/admin-moderation.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Kiểm duyệt bình luận: tìm theo nội dung, ẩn/xoá comment vi phạm, phục hồi
 * comment đã xoá. Dùng API thật /comment/{filter-comment,delete,restore}.
 */
@Component({
  selector: 'app-comment-moderation',
  templateUrl: './comment-moderation.component.html',
  styleUrls: ['./comment-moderation.component.scss']
})
export class CommentModerationComponent implements OnInit, OnDestroy {
  comments: AdminComment[] = [];
  isLoading = false;
  search = '';
  includeDeleted = false;

  page = 1;
  pageSize = 20;
  totalCount = 0;

  /** Id đang xử lý (disable nút trong lúc gọi API). */
  busyId: string | null = null;

  /**
   * Id của comment đang mở panel chi tiết (chỉ mở 1 lúc 1 cái).
   * API đã trả đủ field (AdminCommentDto) nên panel KHÔNG cần gọi thêm request.
   */
  expandedId: string | null = null;

  private search$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private moderation: AdminModerationService,
    private dialog: MatDialog,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.search$.pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => this.load(1));
    this.load(1);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void { this.search$.next(); }

  /** Mở/đóng panel chi tiết của 1 comment. */
  toggleExpand(c: AdminComment): void {
    this.expandedId = this.expandedId === c.id ? null : c.id;
  }

  isExpanded(c: AdminComment): boolean {
    return this.expandedId === c.id;
  }

  /** Nhãn vị trí comment: truyện + chương (nếu có). */
  locationLabel(c: AdminComment): string {
    if (c.blogId) return 'Blog';
    if (!c.mangaId && !c.chapterId) return '—';
    const manga = c.mangaName || c.mangaId || '?';
    if (!c.chapterId) return manga;
    const ch = c.chapterName || (c.chapterIndex != null ? `Chương ${c.chapterIndex}` : 'Chương ?');
    return `${manga} · ${ch}`;
  }

  /** Comment này là reply (có cha) hay comment gốc? */
  isReply(c: AdminComment): boolean {
    return !!(c.parentId || c.replyToCommentId);
  }

  toggleIncludeDeleted(): void {
    this.includeDeleted = !this.includeDeleted;
    this.load(1);
  }

  load(page = this.page): void {
    this.page = page;
    this.isLoading = true;
    this.moderation.filterComments({
      keyword: this.search.trim() || undefined,
      includeDeleted: this.includeDeleted,
      page,
      pageSize: this.pageSize,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.comments = res.data;
        this.totalCount = res.totalCount;
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages || p === this.page) return;
    this.load(p);
  }

  askDelete(c: AdminComment): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xoá bình luận này?',
        message: `Bình luận của ${c.displayName} sẽ bị ẩn khỏi ${this.locationLabel(c)}. `
               + `Bạn có thể phục hồi lại ở Thùng rác.`,
        // Cho admin thấy đúng nội dung sắp xoá, tránh xoá nhầm.
        preview: c.message,
        confirmText: 'Xoá bình luận',
        icon: 'delete_outline',
      },
    }).afterClosed().subscribe(ok => { if (ok) this.remove(c); });
  }

  private remove(c: AdminComment): void {
    this.busyId = c.id;
    this.moderation.deleteComment(c.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.busyId = null;
        this.toastr.success('Đã xoá bình luận');
        c.isDeleted = true;
        if (!this.includeDeleted) {
          this.comments = this.comments.filter(x => x.id !== c.id);
          this.totalCount = Math.max(0, this.totalCount - 1);
        }
      },
      error: () => { this.busyId = null; this.toastr.error('Xoá thất bại'); },
    });
  }

  restore(c: AdminComment): void {
    this.busyId = c.id;
    this.moderation.restoreComment(c.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.busyId = null;
        this.toastr.success('Đã phục hồi bình luận');
        c.isDeleted = false;
      },
      error: () => { this.busyId = null; this.toastr.error('Phục hồi thất bại'); },
    });
  }

  trackById = (_: number, c: AdminComment) => c.id;
}
